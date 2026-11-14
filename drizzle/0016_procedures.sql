-- 0004：作答结算下沉到 PL/pgSQL
--
-- 目标：把「锁定作答 → 再查幂等 → 写评价 → 写证据 → 重算阶段 → 写成长事件 → 写 outbox」
--      这一串必须原子完成的动作放进一个函数，应用层只负责“事务外评价”（沙箱执行 / 规则评分）。
--
-- 设计：
--   - 调用方（应用）先在自己的事务里 SELECT ... FOR UPDATE 锁作答并计算题型规则，
--     然后调用 fn_settle_attempt(...) 一次性写库；函数内部再做一次幂等检查，防止并发重入。
--   - 证据种类 kind 与文案 detail 由应用计算后作为 jsonb 传入；阶段重算与事件文案在库内完成，
--     保证“证据—状态—事件—outbox”要么全部写入，要么全部回滚。
--   - p_fault 仅用于测试：在写入第一条证据后抛错，验证整笔结算回滚。

CREATE OR REPLACE FUNCTION fn_settle_attempt(
  p_user uuid,
  p_attempt uuid,
  p_answer text,
  p_submit_key text,
  p_evaluator text,
  p_verdict text,
  p_score numeric,
  p_feedback text,
  p_rubric jsonb,
  p_uncertainty text,
  p_model_call uuid,
  p_evidence jsonb,
  p_fault boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_key text;
  v_eval_id uuid;
  v_item jsonb;
  v_concept uuid;
  v_kind text;
  v_detail text;
  v_used_hints boolean;
  v_ai boolean;
  v_from text;
  v_stage text;
  v_reason text;
  v_due_days int;
  v_ev_id uuid;
  v_gid uuid;
  v_growth jsonb;
  v_stage_ok boolean := false;
  v_evidence jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_first boolean := true;
BEGIN
  SELECT status, submit_key INTO v_status, v_key
    FROM attempts WHERE id = p_attempt AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt % not found for user %', p_attempt, p_user USING ERRCODE = 'P0002';
  END IF;

  -- 幂等：已经结算过就原样返回，不再写任何行
  IF v_status = 'evaluated' THEN
    RETURN jsonb_build_object('replay', true, 'submitKey', v_key);
  END IF;

  -- 唯一索引 attempts_user_submit_key_uq 兜底并发重复提交（23505）
  UPDATE attempts
     SET answer = p_answer, status = 'evaluated', submit_key = p_submit_key, submitted_at = now()
   WHERE id = p_attempt AND user_id = p_user;

  INSERT INTO evaluations (attempt_id, evaluator, verdict, score, feedback, rubric, uncertainty, model_call_id)
  VALUES (p_attempt, p_evaluator, p_verdict, p_score, p_feedback, p_rubric, p_uncertainty, p_model_call)
  RETURNING id INTO v_eval_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) LOOP
    v_concept := (v_item->>'conceptId')::uuid;
    v_kind := v_item->>'kind';
    v_detail := coalesce(v_item->>'detail', '');
    v_used_hints := coalesce((v_item->>'usedHints')::boolean, false);
    v_ai := coalesce((v_item->>'aiAssisted')::boolean, false);

    -- 确保状态行存在，并锁住它（同一用户同一知识点的证据串行重算）
    INSERT INTO learning_states (user_id, concept_id, stage, stage_reason)
    VALUES (p_user, v_concept, 'seed', '已确认这个知识点，等待第一条学习记录')
    ON CONFLICT (user_id, concept_id) DO NOTHING;
    SELECT stage INTO v_from FROM learning_states
     WHERE user_id = p_user AND concept_id = v_concept FOR UPDATE;

    INSERT INTO learning_evidence (user_id, concept_id, kind, attempt_id, used_hints, ai_assisted, detail)
    VALUES (p_user, v_concept, v_kind, p_attempt, v_used_hints, v_ai, v_detail)
    RETURNING id INTO v_ev_id;

    INSERT INTO growth_events (user_id, concept_id, event_type, evidence_id, reason)
    VALUES (p_user, v_concept, 'evidence_added', v_ev_id,
            (CASE v_kind
               WHEN 'self_report' THEN '自述理解'
               WHEN 'read' THEN '阅读资料'
               WHEN 'asked' THEN '提问'
               WHEN 'note' THEN '笔记'
               WHEN 'guided_practice' THEN '引导练习'
               WHEN 'independent_attempt' THEN '独立作答'
               WHEN 'independent_variant_pass' THEN '独立变式通过'
               WHEN 'team_work' THEN '团队/作品'
               ELSE v_kind END) || '：' || v_detail)
    RETURNING id INTO v_gid;

    SELECT to_jsonb(g) INTO v_growth FROM growth_events g WHERE g.id = v_gid;
    v_events := v_events || jsonb_build_array(v_growth);

    -- 按“有效证据集合”重算阶段（与 src/server/growth.ts 的规则一致）
    SELECT CASE
             WHEN bool_or(kind = 'independent_variant_pass') THEN 'bloom'
             WHEN bool_or(kind = 'independent_attempt') THEN 'bud'
             WHEN bool_or(kind = 'guided_practice') THEN 'leaf'
             WHEN bool_or(kind IN ('read', 'asked', 'note')) THEN 'sprout'
             ELSE 'seed'
           END
      INTO v_stage
      FROM learning_evidence
     WHERE user_id = p_user AND concept_id = v_concept AND revoked_at IS NULL;

    v_reason := CASE v_stage
      WHEN 'bloom' THEN '已有一次不使用提示、首次作答即正确的独立变式验证'
      WHEN 'bud' THEN '已经尝试过独立作答；还需要一次独立变式验证才会开花'
      WHEN 'leaf' THEN '完成过引导练习（含提示或引导模式）'
      WHEN 'sprout' THEN '有阅读、提问或笔记记录'
      ELSE '已确认这个知识点，等待第一条学习记录' END;
    v_due_days := CASE v_stage WHEN 'seed' THEN 3 WHEN 'sprout' THEN 3 WHEN 'leaf' THEN 5 WHEN 'bud' THEN 4 ELSE 14 END;

    UPDATE learning_states
       SET stage = v_stage,
           stage_reason = v_reason,
           last_evidence_at = (SELECT max(created_at) FROM learning_evidence
                                WHERE user_id = p_user AND concept_id = v_concept AND revoked_at IS NULL),
           review_due_at = now() + make_interval(days => v_due_days),
           updated_at = now(),
           version = version + 1
     WHERE user_id = p_user AND concept_id = v_concept;

    IF v_stage <> v_from THEN
      INSERT INTO growth_events (user_id, concept_id, event_type, from_stage, to_stage, evidence_id, reason)
      VALUES (p_user, v_concept, 'stage_changed', v_from, v_stage, v_ev_id,
              '新增' || (CASE v_kind
                           WHEN 'self_report' THEN '自述理解'
                           WHEN 'read' THEN '阅读资料'
                           WHEN 'asked' THEN '提问'
                           WHEN 'note' THEN '笔记'
                           WHEN 'guided_practice' THEN '引导练习'
                           WHEN 'independent_attempt' THEN '独立作答'
                           WHEN 'independent_variant_pass' THEN '独立变式通过'
                           WHEN 'team_work' THEN '团队/作品'
                           ELSE '证据' END) || '证据；' || v_reason)
      RETURNING id INTO v_gid;

      SELECT to_jsonb(g) INTO v_growth FROM growth_events g WHERE g.id = v_gid;
      v_events := v_events || jsonb_build_array(v_growth);

      INSERT INTO outbox_events (topic, aggregate_id, payload)
      VALUES ('growth.stage_changed', v_concept,
              jsonb_build_object('userId', p_user, 'conceptId', v_concept, 'fromStage', v_from, 'toStage', v_stage, 'growthEventId', v_gid));
    END IF;

    v_evidence := v_evidence || jsonb_build_array(jsonb_build_object(
      'conceptId', v_concept, 'kind', v_kind, 'detail', v_detail,
      'fromStage', v_from, 'toStage', v_stage));

    IF p_fault AND v_first THEN
      RAISE EXCEPTION 'injected fault after evidence' USING ERRCODE = 'P0001';
    END IF;
    v_first := false;
  END LOOP;

  RETURN jsonb_build_object(
    'replay', false,
    'evaluationId', v_eval_id,
    'evidence', v_evidence,
    'events', v_events
  );
END $$;

COMMENT ON FUNCTION fn_settle_attempt(uuid, uuid, text, text, text, text, numeric, text, jsonb, text, uuid, jsonb, boolean)
  IS '作答结算：锁定 + 幂等复查 + 评价/证据/阶段/成长事件/outbox 原子写入（p_fault 仅用于回滚测试）';
