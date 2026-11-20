-- 0030：把 C3（倒排检索）与 C5（记忆系统）的 SQL 草稿正式并入迁移
--
-- 背景：C3/C5 先用 docs/sql/drafts/*.sql 在本机验证，handoff 明确“正式 schema/migration/RLS 由 A 集成”。
-- 本迁移做四件事：
--   1) message_terms 倒排表 + 分词函数 + 消息/标题同步触发器 + 历史回填；
--   2) memories 增补记忆字段 + 活跃去重唯一索引；
--   3) memory_controls / conversation_summaries 两张记忆支撑表；
--   4) 为三张新表补 RLS（message_terms 通过所属消息判定归属）。
-- 可重复执行：全部 IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS。

CREATE EXTENSION IF NOT EXISTS pg_trgm;

/* ───────── 1. 倒排检索：message_terms ───────── */
CREATE TABLE IF NOT EXISTS message_terms (
  term       text  NOT NULL,
  message_id uuid  NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  weight     real  NOT NULL CHECK (weight > 0),
  PRIMARY KEY (term, message_id)
);
CREATE INDEX IF NOT EXISTS message_terms_message_idx ON message_terms(message_id);
CREATE INDEX IF NOT EXISTS message_terms_trgm_idx ON message_terms USING gin (term gin_trgm_ops);

CREATE OR REPLACE FUNCTION kv_search_terms(input text)
RETURNS TABLE(term text, weight real) LANGUAGE sql IMMUTABLE STRICT AS $$
  WITH runs AS (
    SELECT m[1] AS s FROM regexp_matches(input, '([一-鿿]+|[A-Za-z0-9_]+)', 'g') m
  ), tokens AS (
    SELECT substring(s FROM i FOR 2) AS t
      FROM runs CROSS JOIN LATERAL generate_series(1, char_length(s) - 1) i
     WHERE s ~ '^[一-鿿]+$'
    UNION ALL
    SELECT lower(s) FROM runs WHERE s ~ '^[A-Za-z0-9_]{2,80}$'
  )
  SELECT t, least(count(*), 8)::real FROM tokens GROUP BY t
$$;

CREATE OR REPLACE FUNCTION kv_index_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM message_terms WHERE message_id = NEW.id;
  INSERT INTO message_terms(term, message_id, weight)
  SELECT t.term, NEW.id, t.weight
    FROM kv_search_terms(NEW.content || ' ' ||
         coalesce((SELECT title FROM conversations WHERE id = NEW.conversation_id), '')) t;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_terms_sync ON messages;
CREATE TRIGGER messages_terms_sync
  AFTER INSERT OR UPDATE OF content ON messages
  FOR EACH ROW EXECUTE FUNCTION kv_index_message();

CREATE OR REPLACE FUNCTION kv_index_conversation_title() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE messages SET content = content WHERE conversation_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conversations_terms_sync ON conversations;
CREATE TRIGGER conversations_terms_sync
  AFTER UPDATE OF title ON conversations
  FOR EACH ROW EXECUTE FUNCTION kv_index_conversation_title();

INSERT INTO message_terms(term, message_id, weight)
SELECT t.term, m.id, t.weight
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
 CROSS JOIN LATERAL kv_search_terms(m.content || ' ' || c.title) t
ON CONFLICT (term, message_id) DO UPDATE SET weight = excluded.weight;

ALTER TABLE message_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_terms_owner_rls ON message_terms;
CREATE POLICY message_terms_owner_rls ON message_terms
  USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_terms.message_id AND m.user_id = kv_current_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_terms.message_id AND m.user_id = kv_current_user_id()));

/* ───────── 2. 记忆字段 ───────── */
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_norm text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0.8;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance integer NOT NULL DEFAULT 3;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS revoke_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memories_confidence_ck') THEN
    ALTER TABLE memories ADD CONSTRAINT memories_confidence_ck CHECK (confidence BETWEEN 0 AND 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memories_importance_ck') THEN
    ALTER TABLE memories ADD CONSTRAINT memories_importance_ck CHECK (importance BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS memories_active_norm_uq
  ON memories(user_id, kind, content_norm)
  WHERE status = 'active' AND content_norm IS NOT NULL;

/* ───────── 3. 记忆支撑表 ───────── */
CREATE TABLE IF NOT EXISTS memory_controls (
  user_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upto_seq        integer NOT NULL CHECK (upto_seq > 0),
  summary         text NOT NULL,
  model_call_id   uuid REFERENCES model_calls(id) ON DELETE SET NULL,
  memory_revision integer NOT NULL DEFAULT 0,
  method          text NOT NULL DEFAULT 'extractive-v1',
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_summaries_user_idx ON conversation_summaries(user_id);

ALTER TABLE memory_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_controls_owner_rls ON memory_controls;
CREATE POLICY memory_controls_owner_rls ON memory_controls
  USING (user_id = kv_current_user_id())
  WITH CHECK (user_id = kv_current_user_id());

ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_summaries_owner_rls ON conversation_summaries;
CREATE POLICY conversation_summaries_owner_rls ON conversation_summaries
  USING (user_id = kv_current_user_id())
  WITH CHECK (user_id = kv_current_user_id());

COMMENT ON TABLE message_terms IS 'C3 倒排索引：中文二元组/英文词项 → 消息，触发器同步';
COMMENT ON TABLE memory_controls IS 'C5 记忆版本号：记忆变更后使会话摘要失效';
COMMENT ON TABLE conversation_summaries IS 'C5 会话摘要：每 6 轮或超长时重写，带记忆版本';
