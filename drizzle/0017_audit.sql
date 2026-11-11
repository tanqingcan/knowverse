-- 0005：审计日志（按月分区 + 通用触发器）
--
-- 目标：
--   1. 用触发器记录敏感表的变更（谁、什么时候、改了哪张表的哪一行、改前改后）；
--   2. 用 RANGE 分区控制单表体积，并让按时间的查询走分区裁剪；
--   3. 用 DEFAULT 分区兜底，避免新月份没有分区时写入失败（维护脚本按需补建）。
--
-- 敏感表选择（与隐私/班级相关）：sharing_preferences、class_members、learning_evidence。
-- audit_log 自身启用 RLS：只能看到自己的操作记录（actor_user_id 为空的是系统操作）。

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  table_name text NOT NULL,
  op text NOT NULL,
  row_pk text,
  old_row jsonb,
  new_row jsonb,
  PRIMARY KEY (id, at),
  CONSTRAINT audit_log_op_ck CHECK (op IN ('INSERT', 'UPDATE', 'DELETE'))
) PARTITION BY RANGE (at);

CREATE TABLE audit_log_2026_10 PARTITION OF audit_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_log_2026_11 PARTITION OF audit_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_log_2026_12 PARTITION OF audit_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE audit_log_2027_01 PARTITION OF audit_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
-- 兜底分区：超出已建范围的数据先落这里，不丢；维护脚本会按需补建具体月份
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_table_idx ON audit_log (table_name, at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_self_rls ON audit_log
  USING (actor_user_id IS NULL OR actor_user_id = kv_current_user_id())
  WITH CHECK (actor_user_id IS NULL OR actor_user_id = kv_current_user_id());

/* ───────── 通用审计触发器 ───────── */
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;

  INSERT INTO audit_log (actor_user_id, table_name, op, row_pk, old_row, new_row)
  VALUES (
    nullif(current_setting('app.user_id', true), '')::uuid,
    TG_TABLE_NAME,
    TG_OP,
    coalesce(v_new ->> 'id', v_old ->> 'id', md5(coalesce(v_new, v_old)::text)),
    v_old,
    v_new
  );
  RETURN NULL;  -- AFTER 触发器，返回值被忽略
END $$;

CREATE TRIGGER sharing_preferences_audit
  AFTER INSERT OR UPDATE OR DELETE ON sharing_preferences
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER class_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON class_members
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

CREATE TRIGGER learning_evidence_audit
  AFTER INSERT OR UPDATE OR DELETE ON learning_evidence
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

COMMENT ON TABLE audit_log IS '敏感表变更审计（按月 RANGE 分区，DEFAULT 分区兜底）；由 fn_audit_row 触发器写入';
COMMENT ON FUNCTION fn_audit_row() IS '通用审计触发器：记录 actor（app.user_id）、表名、操作、主键、变更前后镜像';
