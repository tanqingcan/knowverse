-- 0014：存储过程 + 游标 + 动态 SQL + 子模式（对应第 8 章与第 4/7 章的视图机制）
--
-- 1) PROCEDURE kv_nightly_maintenance(IN p_days int, INOUT p_report jsonb)
--    课程第 8 章区分「存储过程」和「存储函数」：过程用 CALL 调用、可以有 INOUT/OUT 参数，
--    内部可以用游标逐行处理、用 EXECUTE 执行动态 SQL、用 EXCEPTION 捕获错误。
--    这里把夜间维护做成一个真正的 PROCEDURE：
--      - 显式游标遍历“归档超过 N 天”的会话；
--      - 清理超时未完成的 pending 消息；
--      - 调用存储函数对账班级统计；
--      - 动态 SQL（固定白名单 + %I 转义）执行 ANALYZE；
--      - 单步异常不中断整轮，错误写进 INOUT 报告。
--
-- 2) 子模式（第 4.3 视图机制 / 第 7.4.3 设计用户子模式）：
--    为教师提供只读聚合视图；视图由所有者执行、只暴露聚合列，
--    角色 kv_teacher 只被授予这两个视图（没有底层表权限）——这正是课程里的“视图 + 授权”。

CREATE OR REPLACE PROCEDURE kv_nightly_maintenance(IN p_days integer DEFAULT 7, INOUT p_report jsonb DEFAULT '{}'::jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  v_archived_sessions int := 0;
  v_stale_messages int := 0;
  v_reconciled int := 0;
  v_analyzed text[] := '{}';
  v_warnings text[] := '{}';
  v_tbl text;
  v_row record;
  v_cutoff timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_t0 timestamptz := clock_timestamp();
  cur_sessions CURSOR FOR
    SELECT c.id, c.title
      FROM conversations c
     WHERE c.archived_at IS NOT NULL AND c.archived_at < v_cutoff
     ORDER BY c.archived_at;
BEGIN
  -- 1) 显式游标：逐行处理归档会话（演示 OPEN / FETCH / CLOSE）
  OPEN cur_sessions;
  LOOP
    FETCH cur_sessions INTO v_row;
    EXIT WHEN NOT FOUND;
    v_archived_sessions := v_archived_sessions + 1;
  END LOOP;
  CLOSE cur_sessions;

  -- 2) 清理超时未完成的 pending 消息
  UPDATE messages
     SET status = 'failed', error_message = '生成被中断（夜间维护判定），可以安全重试'
   WHERE status = 'pending'
     AND created_at < now() - interval '2 minutes';
  GET DIAGNOSTICS v_stale_messages = ROW_COUNT;

  -- 3) 调用存储函数：班级统计对账（异常写入报告，不中断）
  BEGIN
    v_reconciled := fn_reconcile_class_stats();
  EXCEPTION WHEN OTHERS THEN
    v_warnings := array_append(v_warnings, 'class_stats 对账失败：' || SQLERRM);
  END;

  -- 4) 动态 SQL：白名单表名 + format %I 转义
  FOREACH v_tbl IN ARRAY ARRAY['messages', 'learning_evidence', 'class_stats', 'outbox_events'] LOOP
    BEGIN
      EXECUTE format('ANALYZE %I', v_tbl);
      v_analyzed := array_append(v_analyzed, v_tbl);
    EXCEPTION WHEN OTHERS THEN
      v_warnings := array_append(v_warnings, format('ANALYZE %I 失败：%s', v_tbl, SQLERRM));
    END;
  END LOOP;

  -- 5) 写一条 outbox 事件，供 CDC / 监控消费
  INSERT INTO outbox_events (topic, aggregate_id, payload)
  VALUES ('maintenance.nightly', gen_random_uuid(),
          jsonb_build_object('archivedSessions', v_archived_sessions, 'staleMessages', v_stale_messages,
                             'reconciled', v_reconciled, 'at', now()));

  p_report := jsonb_build_object(
    'archivedSessions', v_archived_sessions,
    'staleMessages', v_stale_messages,
    'reconciledClassStats', v_reconciled,
    'analyzed', to_jsonb(v_analyzed),
    'warnings', to_jsonb(v_warnings),
    'durationMs', round(extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int
  );
END $$;

COMMENT ON PROCEDURE kv_nightly_maintenance(integer, jsonb)
  IS '夜间维护（存储过程）：游标遍历归档会话、清理超时消息、对账班级统计、白名单动态 ANALYZE，INOUT 返回报告';

/* ───────── 子模式：教师只读视图（只暴露聚合，不含个人内容） ───────── */
CREATE OR REPLACE VIEW v_teacher_class_overview AS
SELECT c.id AS class_id,
       c.name AS class_name,
       count(DISTINCT m.user_id)::int AS member_count,
       count(DISTINCT p.id)::int AS plant_count,
       count(DISTINCT e.id)::int AS evidence_count,
       max(ls.last_evidence_at) AS last_active_at
FROM classes c
LEFT JOIN class_members m ON m.class_id = c.id
LEFT JOIN planets p ON p.user_id = m.user_id
LEFT JOIN learning_evidence e ON e.user_id = m.user_id
LEFT JOIN learning_states ls ON ls.user_id = m.user_id
GROUP BY c.id, c.name;

CREATE OR REPLACE VIEW v_teacher_concept_heat AS
SELECT k.id AS concept_id,
       k.name AS concept_name,
       s.name AS subject_name,
       (SELECT count(DISTINCT mc.message_id) FROM message_concepts mc
         WHERE mc.concept_id = k.id AND mc.status <> 'rejected')::int AS asked_messages,
       (SELECT count(*) FROM attempts a
          JOIN evaluations ev ON ev.attempt_id = a.id
          JOIN task_versions tv ON tv.id = a.task_version_id
          JOIN task_concepts tc ON tc.task_id = tv.task_id
         WHERE tc.concept_id = k.id AND ev.verdict IN ('incorrect', 'partial'))::int AS mistake_attempts,
       (SELECT count(*) FROM learning_states ls
         WHERE ls.concept_id = k.id AND ls.stage = 'bloom')::int AS bloomed_users
FROM concepts k
JOIN subjects s ON s.id = k.subject_id
WHERE k.owner_user_id IS NULL;

COMMENT ON VIEW v_teacher_class_overview IS '教师子模式：只读班级聚合，不含任何学生个人内容';
COMMENT ON VIEW v_teacher_concept_heat IS '教师子模式：知识点热度（提问/错题/开花人数），聚合层面';

-- 教师角色：不登录，只被授予两个视图（授权演示用 SET ROLE）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kv_teacher') THEN
    CREATE ROLE kv_teacher NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON v_teacher_class_overview, v_teacher_concept_heat FROM PUBLIC;
GRANT SELECT ON v_teacher_class_overview, v_teacher_concept_heat TO kv_teacher;
