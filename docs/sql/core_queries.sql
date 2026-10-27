-- ============================================================================
-- 知屿 KNOWVERSE —— 驱动产品的核心 SQL（摘录自应用代码，全部参数化执行）
-- 完整 DDL 见 drizzle/0000_init.sql（drizzle-kit 根据 src/db/schema.ts 生成）与 drizzle/0001_constraints_triggers.sql（手写约束/触发器）
-- 参数：$1 当前用户 ID（所有查询的权限条件），$2 用户时区（如 'Asia/Taipei'）
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Q1 历史问答组合检索（src/server/history.ts · buildHistorySql）
--   以下是“关键词 + 起止日期 + 知识点”全部启用时生成的语句；未启用的条件不出现在 SQL 中。
--   $3 = '%' || 转义后的关键词 || '%'（% _ \ 被转义，ESCAPE '\'）；$4/$5 = 'YYYY-MM-DD'；$6 = 知识点 uuid[]；$7 页大小；$8 偏移
--   日期语义：按用户时区的自然日，左闭右开 [from 00:00, to+1 00:00)
--   三路候选（问题正文 / 回答正文 / 会话标题）各自可命中 pg_trgm GIN 索引，再 UNION 去重。
-- ---------------------------------------------------------------------------
WITH cand AS (
        SELECT m.id AS qid FROM messages m
         WHERE m.user_id = $1 AND m.role = 'user' AND m.content ILIKE $3 ESCAPE '\'
      UNION
        SELECT m.reply_to_id FROM messages m
         WHERE m.user_id = $1 AND m.role = 'assistant' AND m.content ILIKE $3 ESCAPE '\'
      UNION
        SELECT m.id FROM conversations cv JOIN messages m ON m.conversation_id = cv.id AND m.user_id = cv.user_id
         WHERE cv.user_id = $1 AND m.role = 'user' AND cv.title ILIKE $3 ESCAPE '\'
    ), base AS (
  SELECT qm.id AS question_id, qm.conversation_id, qm.content AS question, qm.created_at,
         c.title, c.origin, am.id AS answer_id, am.content AS answer, am.status AS answer_status
  FROM cand JOIN messages qm ON qm.id = cand.qid
  JOIN conversations c ON c.id = qm.conversation_id AND c.user_id = qm.user_id
  LEFT JOIN LATERAL (
     SELECT a.id, a.content, a.status FROM messages a
     WHERE a.reply_to_id = qm.id AND a.user_id = qm.user_id
     ORDER BY a.seq DESC LIMIT 1) am ON true
  WHERE qm.user_id = $1
    AND qm.role = 'user'
    AND c.archived_at IS NULL
    AND qm.created_at >= ($4::date)::timestamp AT TIME ZONE $2
    AND qm.created_at < (($5::date + 1)::timestamp AT TIME ZONE $2)
    AND EXISTS (SELECT 1 FROM message_concepts mc
                         WHERE mc.message_id IN (qm.id, am.id) AND mc.status <> 'rejected'
                           AND mc.concept_id = ANY($6::uuid[]))
)
SELECT b.*, to_char(b.created_at AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS local_time, count(*) OVER () AS total
FROM base b
ORDER BY b.created_at DESC, b.question_id DESC
LIMIT $7 OFFSET $8
;

-- ---------------------------------------------------------------------------
-- Q2 某知识点（植物）的完整学习档案（src/server/world.ts · plantDossier，节选）
-- ---------------------------------------------------------------------------
-- 2a 当前状态（受控冗余汇总）
SELECT ls.stage, ls.stage_reason, ls.last_evidence_at, ls.review_due_at
FROM learning_states ls WHERE ls.user_id = $1 AND ls.concept_id = $2;
-- 2b 全部证据（含已撤销），并带回原消息与作答评价
SELECT e.id, e.kind, e.detail, e.used_hints, e.ai_assisted, e.created_at, e.revoked_at, e.revoke_reason,
       e.message_id, m.conversation_id, e.attempt_id, ev.verdict, tv.prompt
FROM learning_evidence e
LEFT JOIN messages m ON m.id = e.message_id AND m.user_id = e.user_id
LEFT JOIN attempts a ON a.id = e.attempt_id
LEFT JOIN evaluations ev ON ev.attempt_id = a.id
LEFT JOIN task_versions tv ON tv.id = a.task_version_id
WHERE e.user_id = $1 AND e.concept_id = $2
ORDER BY e.created_at DESC;
-- 2c 关联问答（从一株花进入它关联的全部问答）
SELECT DISTINCT ON (qm.id) qm.id, qm.conversation_id, qm.content, qm.created_at, mc.status, c.title
FROM message_concepts mc
JOIN messages m0 ON m0.id = mc.message_id
JOIN messages qm ON qm.id = CASE WHEN m0.role = 'user' THEN m0.id ELSE m0.reply_to_id END
JOIN conversations c ON c.id = qm.conversation_id
WHERE qm.user_id = $1 AND mc.concept_id = $2 AND mc.status <> 'rejected' AND c.archived_at IS NULL
ORDER BY qm.id, mc.status = 'confirmed' DESC;

-- ---------------------------------------------------------------------------
-- Q3 待复习与待验证汇总（src/server/practice.ts · reviewSummary）
-- ---------------------------------------------------------------------------
SELECT ls.concept_id, k.name, s.name AS subject, ls.stage, ls.review_due_at,
       CASE WHEN ls.stage = 'bud' THEN 'to_verify' WHEN ls.review_due_at < now() THEN 'review_due' ELSE 'later' END AS kind
FROM learning_states ls JOIN concepts k ON k.id = ls.concept_id JOIN subjects s ON s.id = k.subject_id
WHERE ls.user_id = $1 AND (ls.stage = 'bud' OR ls.review_due_at < now())
ORDER BY (ls.stage = 'bud') DESC, ls.review_due_at;

-- ---------------------------------------------------------------------------
-- Q4 所有先修条件都已满足（先修至少“生叶”）的候选任务（practice.ts · readyTasks）
--    “不存在一个未满足的先修” = 关系代数中的除法思想
-- ---------------------------------------------------------------------------
SELECT t.id, t.title, k.name
FROM tasks t JOIN task_concepts tc ON tc.task_id = t.id JOIN concepts k ON k.id = tc.concept_id
WHERE (t.owner_user_id IS NULL OR t.owner_user_id = $1) AND t.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM concept_prerequisites cp
    LEFT JOIN learning_states ls ON ls.user_id = $1 AND ls.concept_id = cp.prereq_concept_id
    WHERE cp.concept_id = tc.concept_id AND coalesce(ls.stage, 'seed') NOT IN ('leaf', 'bud', 'bloom'));

-- ---------------------------------------------------------------------------
-- Q5 递归 CTE：先修闭包（带路径数组防环）（src/server/concepts.ts · prerequisiteClosure）
-- ---------------------------------------------------------------------------
WITH RECURSIVE pre(concept_id, prereq_id, depth, path) AS (
    SELECT cp.concept_id, cp.prereq_concept_id, 1, ARRAY[cp.concept_id, cp.prereq_concept_id]
    FROM concept_prerequisites cp WHERE cp.concept_id = ANY($1::uuid[])
  UNION ALL
    SELECT pre.concept_id, cp.prereq_concept_id, pre.depth + 1, pre.path || cp.prereq_concept_id
    FROM pre JOIN concept_prerequisites cp ON cp.concept_id = pre.prereq_id
    WHERE NOT cp.prereq_concept_id = ANY(pre.path) AND pre.depth < 12)
SELECT concept_id, prereq_id, min(depth) FROM pre GROUP BY concept_id, prereq_id;
-- 循环检测：插入 concept_prerequisites 前由触发器 kv_check_prereq_cycle() 用递归 CTE 判断（见 drizzle/0001）

-- ---------------------------------------------------------------------------
-- Q6 可解释的互补学习伙伴匹配（src/server/classes.ts · PARTNER_SQL）
--    只使用双方“公开”的学习意愿；双方都需开启 open_to_partner；$1 班级，$2 当前用户
-- ---------------------------------------------------------------------------
WITH me AS (SELECT concept_id, direction FROM learning_intents WHERE class_id = $1 AND user_id = $2 AND withdrawn_at IS NULL),
     others AS (
       SELECT li.user_id, li.concept_id, li.direction FROM learning_intents li
       JOIN sharing_preferences sp ON sp.class_id = li.class_id AND sp.user_id = li.user_id AND sp.open_to_partner
       WHERE li.class_id = $1 AND li.user_id <> $2 AND li.withdrawn_at IS NULL),
     pairs AS (
       SELECT o.user_id, o.concept_id, CASE WHEN me.direction = 'seek' THEN 'they_offer' ELSE 'they_seek' END AS kind
       FROM me JOIN others o ON o.concept_id = me.concept_id AND o.direction <> me.direction)
SELECT p.user_id, u.display_name,
       array_agg(k.name ORDER BY k.name) FILTER (WHERE p.kind = 'they_offer') AS they_can_help,
       array_agg(k.name ORDER BY k.name) FILTER (WHERE p.kind = 'they_seek') AS you_can_help,
       count(*) AS score, bool_or(p.kind = 'they_offer') AND bool_or(p.kind = 'they_seek') AS mutual
FROM pairs p JOIN users u ON u.id = p.user_id JOIN concepts k ON k.id = p.concept_id
WHERE EXISTS (SELECT 1 FROM sharing_preferences s WHERE s.class_id = $1 AND s.user_id = $2 AND s.open_to_partner)
GROUP BY p.user_id, u.display_name
ORDER BY mutual DESC, score DESC, u.display_name LIMIT 10;

-- ---------------------------------------------------------------------------
-- T1 作答提交事务（src/server/practice.ts · submitAttempt；评价在事务之外完成）
-- ---------------------------------------------------------------------------
-- BEGIN;
--   SELECT status, submit_key, mode FROM attempts WHERE id = $a AND user_id = $1 FOR UPDATE;   -- 锁定作答
--   -- 已结算且键相同 → 直接返回已存结果（幂等）；键不同 → 409
--   UPDATE attempts SET answer = $ans, status = 'evaluated', submit_key = $key, submitted_at = now() WHERE id = $a AND user_id = $1;
--        -- 唯一索引 attempts_user_submit_key_uq (user_id, submit_key) 防止同键并发重复结算
--   INSERT INTO evaluations (...);                       -- evaluations_attempt_uq：一次作答只有一条评价
--   INSERT INTO learning_evidence (...);                 -- 证据（类别区分自述/记录/辅助/独立/团队）
--   SELECT stage FROM learning_states WHERE user_id = $1 AND concept_id = $k FOR UPDATE;
--   UPDATE learning_states SET stage = <由有效证据重新计算>, version = version + 1 ...;
--   INSERT INTO growth_events (... 'evidence_added' ...), (... 'stage_changed' ...);
--   INSERT INTO outbox_events (topic, aggregate_id, payload) VALUES ('growth.stage_changed', ...);
-- COMMIT;   -- 任一步失败 → ROLLBACK，作答保持 open，可用同一幂等键安全重试

-- ---------------------------------------------------------------------------
-- T2 共学小组最后一个名额（触发器 kv_guard_group_capacity，drizzle/0001）
-- ---------------------------------------------------------------------------
-- BEFORE INSERT ON study_group_members:
--   SELECT capacity, status FROM study_groups WHERE id = NEW.group_id FOR UPDATE;  -- 串行化同一小组的并发加入
--   IF (SELECT count(*) FROM study_group_members WHERE group_id = NEW.group_id) >= capacity THEN RAISE 'study group full';

-- ---------------------------------------------------------------------------
-- T3 outbox 事务外投递（classes.ts · drainOutbox）
-- ---------------------------------------------------------------------------
SELECT id, topic, aggregate_id, payload FROM outbox_events WHERE delivered_at IS NULL ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED;
-- UPDATE outbox_events SET delivered_at = now(), attempts = attempts + 1 WHERE id = $id;
