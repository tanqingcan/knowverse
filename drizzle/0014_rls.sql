-- 0002：行级安全（RLS）——把「谁能看哪一行」交给数据库判定
--
-- 设计：
--   应用以 kv_app（非表所有者、NOSUPERUSER、NOBYPASSRLS）连接；
--   每个请求在事务内执行 SELECT set_config('app.user_id', <当前用户>, true)；
--   策略统一用 kv_current_user_id() 读取该会话变量，未设置时返回 NULL，策略判定为假 → 0 行。
--
-- 角色与表级授权由 scripts/security-setup.ts 幂等创建/授予（与 sandbox 相同的模式），
-- 本迁移只定义“策略”本身，因此不包含角色名与密码。
--
-- 范围说明（有意不启用 RLS 的表）：
--   users / auth_sessions：登录发生在会话建立之前，尚不知道 app.user_id；
--   subjects / concepts / tasks / task_versions：公共课程目录与题库（owner 为空即公共）；
--   planets / gardens / plants / learning_states：班级星系需要跨用户只读，A2 用 SECURITY DEFINER 视图收口；
--   knowledge_cards / card_versions / classes / class_* / study_* / learning_intents：
--     班级共享域，跨租户可见，A2 用视图 + 授权收口。
-- 这些表仍由应用层 SQL 的 user_id 条件保护，待 A2 完成后纳管。

/* ───────── 会话变量读取器 ───────── */
CREATE OR REPLACE FUNCTION kv_current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

COMMENT ON FUNCTION kv_current_user_id() IS '当前会话的应用用户（由事务内 set_config(app.user_id) 设置）；未设置时返回 NULL';

/* ───────── 1. 对话与消息 ───────── */
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_owner_rls" ON "conversations"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_owner_rls" ON "messages"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

-- 消息上的知识点标签：只有能看到该消息，才能看到标签
ALTER TABLE "message_concepts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_concepts_owner_rls" ON "message_concepts"
  USING (EXISTS (SELECT 1 FROM "messages" m WHERE m.id = "message_concepts"."message_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "messages" m WHERE m.id = "message_concepts"."message_id"));

-- 引用（含资料原文摘录）：随消息
ALTER TABLE "message_citations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_citations_owner_rls" ON "message_citations"
  USING (EXISTS (SELECT 1 FROM "messages" m WHERE m.id = "message_citations"."message_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "messages" m WHERE m.id = "message_citations"."message_id"));

/* ───────── 2. 模型调用与概念候选 ───────── */
ALTER TABLE "model_calls" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_calls_owner_rls" ON "model_calls"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

ALTER TABLE "concept_suggestions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept_suggestions_owner_rls" ON "concept_suggestions"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

/* ───────── 3. 目标、练习与成长 ───────── */
ALTER TABLE "learning_goals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_goals_owner_rls" ON "learning_goals"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_owner_rls" ON "notes"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

ALTER TABLE "attempts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts_owner_rls" ON "attempts"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

-- 评价与提示记录没有 user_id，随作答
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evaluations_owner_rls" ON "evaluations"
  USING (EXISTS (SELECT 1 FROM "attempts" a WHERE a.id = "evaluations"."attempt_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "attempts" a WHERE a.id = "evaluations"."attempt_id"));

ALTER TABLE "hint_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hint_events_owner_rls" ON "hint_events"
  USING (EXISTS (SELECT 1 FROM "attempts" a WHERE a.id = "hint_events"."attempt_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "attempts" a WHERE a.id = "hint_events"."attempt_id"));

ALTER TABLE "learning_evidence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_evidence_owner_rls" ON "learning_evidence"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

ALTER TABLE "growth_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_events_owner_rls" ON "growth_events"
  USING ("user_id" = kv_current_user_id())
  WITH CHECK ("user_id" = kv_current_user_id());

/* ───────── 4. 资料（公共资料 + 本人上传） ───────── */
ALTER TABLE "materials" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_owner_rls" ON "materials"
  USING ("owner_user_id" IS NULL OR "owner_user_id" = kv_current_user_id())
  WITH CHECK ("owner_user_id" = kv_current_user_id());   -- 应用角色不能创建“公共资料”

ALTER TABLE "material_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_versions_owner_rls" ON "material_versions"
  USING (EXISTS (SELECT 1 FROM "materials" m WHERE m.id = "material_versions"."material_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "materials" m WHERE m.id = "material_versions"."material_id"));

ALTER TABLE "material_chunks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_chunks_owner_rls" ON "material_chunks"
  USING (EXISTS (SELECT 1 FROM "material_versions" v WHERE v.id = "material_chunks"."version_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "material_versions" v WHERE v.id = "material_chunks"."version_id"));

ALTER TABLE "material_concepts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_concepts_owner_rls" ON "material_concepts"
  USING (EXISTS (SELECT 1 FROM "material_versions" v WHERE v.id = "material_concepts"."version_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "material_versions" v WHERE v.id = "material_concepts"."version_id"));
