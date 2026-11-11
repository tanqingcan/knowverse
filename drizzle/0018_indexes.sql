-- 0006：为高频读路径补索引（部分索引 + 覆盖索引）
--
-- 依据（见 docs/sql/explain-results.md 的前后对比）：
--   1. 待重试消息只占极小比例（几十条 / 4 万条），却每次会话打开都要查；
--      用“部分索引”只索引 pending 行，索引体积几乎为 0。
--   2. 历史检索的主干是「本人 + 按时间倒序 + 只取一页」；在 (user_id, created_at DESC)
--      上做覆盖索引，把外层的 conversation_id / role / status 带进索引，减少回表。
--   3. 待复习查询只在 stage = 'bud' 时需要，同样用部分索引；小数据量下规划器仍会选择全表扫描，
--      这是预期行为（索引是给数据量增长准备的）。

CREATE INDEX IF NOT EXISTS messages_pending_idx
  ON messages (created_at)
  WHERE status = 'pending';

-- 说明（实验记录，见 docs/sql/index-decisions.md）：
--   曾经尝试再加一个覆盖索引 messages (user_id, created_at DESC) INCLUDE (conversation_id, role, status)，
--   但“两字中文关键词”的检索没有 trigram 可用，规划器改用该索引做有序扫描并回表取 content，
--   实测从 88 ms 退化到 1412 ms。收益为零、代价明显，因此**不建立**这个索引。

CREATE INDEX IF NOT EXISTS learning_states_bud_due_idx
  ON learning_states (user_id, review_due_at)
  WHERE stage = 'bud';

COMMENT ON INDEX messages_pending_idx IS '待重试消息：只索引 status = pending 的行';
COMMENT ON INDEX learning_states_bud_due_idx IS '待验证知识点：只索引 stage = bud 的行';
