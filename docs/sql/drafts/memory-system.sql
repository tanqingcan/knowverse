-- C5 additive local draft; final schema/migration/RLS integration belongs to A.
BEGIN;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_norm text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0.8 CHECK(confidence BETWEEN 0 AND 1);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance integer NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 5);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS revoke_reason text;
-- Legacy records remain readable; only new proposals require norm/source checks.
CREATE UNIQUE INDEX IF NOT EXISTS memories_active_norm_uq ON memories(user_id,kind,content_norm) WHERE status='active' AND content_norm IS NOT NULL;
CREATE TABLE IF NOT EXISTS memory_controls (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conversation_summaries (
 conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 upto_seq integer NOT NULL CHECK(upto_seq>0),
 summary text NOT NULL,
 model_call_id uuid REFERENCES model_calls(id) ON DELETE SET NULL,
 memory_revision integer NOT NULL DEFAULT 0,
 method text NOT NULL DEFAULT 'extractive-v1',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_summaries_user_idx ON conversation_summaries(user_id);
COMMIT;
