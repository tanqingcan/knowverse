-- 0001：drizzle-kit 无法直接表达的约束（手写 custom migration）
-- 1) planets ↔ plants 互相引用：本命花外键使用 DEFERRABLE，允许同一事务内先建星球、再建植物、再指定本命花。
ALTER TABLE "planets"
  ADD CONSTRAINT "planets_natal_plant_fk" FOREIGN KEY ("natal_plant_id")
  REFERENCES "plants"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

-- 2) 本命花必须是本星球上的植物（跨表约束，用触发器表达）
CREATE OR REPLACE FUNCTION kv_check_natal_plant() RETURNS trigger AS $$
BEGIN
  IF NEW.natal_plant_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM plants p JOIN gardens g ON g.id = p.garden_id
       WHERE p.id = NEW.natal_plant_id AND g.planet_id = NEW.id) THEN
    RAISE EXCEPTION 'natal plant % does not belong to planet %', NEW.natal_plant_id, NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER planets_natal_plant_ck
  AFTER INSERT OR UPDATE OF natal_plant_id ON planets
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION kv_check_natal_plant();
--> statement-breakpoint

-- 3) “上次上下文”是软引用：目标被删除时置空
ALTER TABLE "users" ADD CONSTRAINT "users_last_conversation_fk"
  FOREIGN KEY ("last_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_last_plant_fk"
  FOREIGN KEY ("last_plant_id") REFERENCES "plants"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- 4) 助手消息必须回复某条用户消息；用户消息不带 reply_to
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_role_ck"
  CHECK ((role = 'assistant') = (reply_to_id IS NOT NULL));
--> statement-breakpoint

-- 5) 先修关系不允许出现环：插入前用递归 CTE 检查“新先修”是否已（间接）依赖当前知识点
CREATE OR REPLACE FUNCTION kv_check_prereq_cycle() RETURNS trigger AS $$
DECLARE has_cycle boolean;
BEGIN
  WITH RECURSIVE up(cid) AS (
      SELECT NEW.prereq_concept_id
    UNION
      SELECT cp.prereq_concept_id FROM concept_prerequisites cp JOIN up ON cp.concept_id = up.cid
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE cid = NEW.concept_id) INTO has_cycle;
  IF has_cycle THEN
    RAISE EXCEPTION 'prerequisite cycle: % -> %', NEW.concept_id, NEW.prereq_concept_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER concept_prereq_cycle_ck
  BEFORE INSERT OR UPDATE ON concept_prerequisites
  FOR EACH ROW EXECUTE FUNCTION kv_check_prereq_cycle();
--> statement-breakpoint

-- 6) 共学小组名额：数据库层兜底。锁住小组行后计数，保证并发申请最后一个名额时不超员。
CREATE OR REPLACE FUNCTION kv_guard_group_capacity() RETURNS trigger AS $$
DECLARE cap int; cnt int; st text;
BEGIN
  SELECT capacity, status INTO cap, st FROM study_groups WHERE id = NEW.group_id FOR UPDATE;
  IF st <> 'open' THEN
    RAISE EXCEPTION 'study group closed' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO cnt FROM study_group_members WHERE group_id = NEW.group_id;
  IF cnt >= cap THEN
    RAISE EXCEPTION 'study group full' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER study_group_capacity_guard
  BEFORE INSERT ON study_group_members
  FOR EACH ROW EXECUTE FUNCTION kv_guard_group_capacity();
