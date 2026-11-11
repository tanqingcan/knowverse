-- 0029：为主线新增的 memories / garden_knowledge_places 补上行级安全
--
-- 背景：主线合入「家园/创造模式」后新增了这两张带 user_id 的表，但没有 RLS 策略。
-- 我们的不变量 E10 与安全自查 S2 在合并后立即报出，这里补上。
-- 说明：kv_app 的表级授权由 scripts/security-setup.ts 统一授予，本迁移只负责策略。

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memories_owner_rls ON memories;
CREATE POLICY memories_owner_rls ON memories
  USING (user_id = kv_current_user_id())
  WITH CHECK (user_id = kv_current_user_id());

ALTER TABLE garden_knowledge_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garden_knowledge_places_owner_rls ON garden_knowledge_places;
CREATE POLICY garden_knowledge_places_owner_rls ON garden_knowledge_places
  USING (user_id = kv_current_user_id())
  WITH CHECK (user_id = kv_current_user_id());
