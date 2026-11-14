-- C3 additive draft; A owns final drizzle/schema integration. Safe to reapply.
BEGIN;
CREATE TABLE IF NOT EXISTS message_terms (
 term text NOT NULL,
 message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 weight real NOT NULL CHECK (weight > 0),
 PRIMARY KEY (term, message_id)
);
CREATE INDEX IF NOT EXISTS message_terms_message_idx ON message_terms(message_id);
CREATE INDEX IF NOT EXISTS message_terms_trgm_idx ON message_terms USING gin(term gin_trgm_ops);
CREATE OR REPLACE FUNCTION kv_search_terms(input text)
RETURNS TABLE(term text, weight real) LANGUAGE sql IMMUTABLE STRICT AS $$
 WITH runs AS (SELECT m[1] AS s FROM regexp_matches(input, '([一-龥]+|[A-Za-z0-9_]+)', 'g') m),
 tokens AS (
 SELECT substring(s FROM i FOR 2) AS t FROM runs CROSS JOIN LATERAL generate_series(1,char_length(s)-1) i WHERE s ~ '^[一-龥]+$'
 UNION ALL SELECT lower(s) FROM runs WHERE s ~ '^[A-Za-z0-9_]{2,80}$')
 SELECT t, least(count(*),8)::real FROM tokens GROUP BY t
$$;
CREATE OR REPLACE FUNCTION kv_index_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM message_terms WHERE message_id=NEW.id;
 INSERT INTO message_terms(term,message_id,weight)
 SELECT term,NEW.id,weight FROM kv_search_terms(NEW.content || ' ' || coalesce((SELECT title FROM conversations WHERE id=NEW.conversation_id),''));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS messages_terms_sync ON messages;
CREATE TRIGGER messages_terms_sync AFTER INSERT OR UPDATE OF content ON messages FOR EACH ROW EXECUTE FUNCTION kv_index_message();
CREATE OR REPLACE FUNCTION kv_index_conversation_title() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.title IS DISTINCT FROM OLD.title THEN
   UPDATE messages SET content=content WHERE conversation_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS conversations_terms_sync ON conversations;
CREATE TRIGGER conversations_terms_sync AFTER UPDATE OF title ON conversations FOR EACH ROW EXECUTE FUNCTION kv_index_conversation_title();
INSERT INTO message_terms(term,message_id,weight)
SELECT t.term,m.id,t.weight FROM messages m JOIN conversations c ON c.id=m.conversation_id
CROSS JOIN LATERAL kv_search_terms(m.content || ' ' || c.title) t
ON CONFLICT(term,message_id) DO UPDATE SET weight=excluded.weight;
COMMIT;
