-- 0007：时间机器——按“证据有效期”重放任意时刻的学习状态
--
-- 背景：learning_states 只保存“现在”。成长时间轴需要回答“10 月 20 日那天这株花是什么阶段”。
-- 做法：不做快照表，而是把证据看作带有效期的区间：
--     证据 e 在时刻 t 有效  ⇔  e.created_at <= t  且  (e.revoked_at IS NULL OR e.revoked_at > t)
--   阶段由该时刻的有效证据集合按 growth.ts 的规则重算（事件重放/时态查询）。
--
-- 安全：两个函数默认 SECURITY INVOKER，底层 RLS 对调用者生效；
--       同时显式校验 p_user 与 app.user_id 一致（系统连接 / 测试无上下文时放行）。

CREATE OR REPLACE FUNCTION fn_stage_at(p_user uuid, p_concept uuid, p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stage text;
BEGIN
  IF kv_current_user_id() IS NOT NULL AND p_user <> kv_current_user_id() THEN
    RAISE EXCEPTION 'cannot query another user' USING ERRCODE = '42501';
  END IF;

  SELECT CASE
           WHEN bool_or(kind = 'independent_variant_pass') THEN 'bloom'
           WHEN bool_or(kind = 'independent_attempt') THEN 'bud'
           WHEN bool_or(kind = 'guided_practice') THEN 'leaf'
           WHEN bool_or(kind IN ('read', 'asked', 'note')) THEN 'sprout'
           ELSE 'seed'
         END
    INTO v_stage
    FROM learning_evidence
   WHERE user_id = p_user AND concept_id = p_concept
     AND created_at <= p_at
     AND (revoked_at IS NULL OR revoked_at > p_at);
  RETURN coalesce(v_stage, 'seed');
END $$;

CREATE OR REPLACE FUNCTION fn_garden_at(p_user uuid, p_at timestamptz)
RETURNS TABLE(
  plant_id uuid,
  concept_name text,
  species text,
  color text,
  garden_name text,
  stage_at text,
  stage_now text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF kv_current_user_id() IS NOT NULL AND p_user <> kv_current_user_id() THEN
    RAISE EXCEPTION 'cannot query another user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         k.name,
         p.species,
         p.color,
         g.name,
         fn_stage_at(p_user, p.concept_id, p_at),
         coalesce(ls.stage, 'seed')
    FROM plants p
    JOIN gardens g ON g.id = p.garden_id
    JOIN planets pl ON pl.id = g.planet_id
    JOIN concepts k ON k.id = p.concept_id
    LEFT JOIN learning_states ls ON ls.user_id = p_user AND ls.concept_id = p.concept_id
   WHERE pl.user_id = p_user AND p.archived_at IS NULL
   ORDER BY g.name, k.name;
END $$;

COMMENT ON FUNCTION fn_stage_at(uuid, uuid, timestamptz)
  IS '按证据有效期重放某人在某时刻的知识点阶段（撤销的证据在撤销时刻之后失效）';
COMMENT ON FUNCTION fn_garden_at(uuid, timestamptz)
  IS '某人的花园在某一时刻的完整快照（每株花的当时阶段与当前阶段）';
