-- 0013：删除班级/用户时，统计触发器要先确认班级还在
--
-- 现象：重新播种（删除演示班级）时，class_members 的级联删除触发 fn_stats_member_change，
-- 它向 class_stats 插入一行 —— 但此时 classes 里的班级行已被删除，触发 class_stats_class_id_fkey。
-- 修复：三个增量触发器在写入前检查班级是否仍存在；班级没了，统计行会随外键级联删除，无需维护。

CREATE OR REPLACE FUNCTION fn_stats_member_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_class uuid;
  v_delta int;
BEGIN
  IF TG_OP = 'INSERT' THEN v_class := NEW.class_id; v_delta := 1;
  ELSE v_class := OLD.class_id; v_delta := -1; END IF;

  -- 班级正在被删除（级联）：不再维护统计
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id = v_class) THEN
    RETURN NULL;
  END IF;

  INSERT INTO class_stats (class_id, member_count, updated_at) VALUES (v_class, greatest(v_delta, 0), now())
  ON CONFLICT (class_id) DO UPDATE
    SET member_count = class_stats.member_count + v_delta, updated_at = now();

  UPDATE class_stats cs
     SET last_active_at = (SELECT max(ls.last_evidence_at)
                             FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
                            WHERE m.class_id = cs.class_id),
         updated_at = now()
   WHERE cs.class_id = v_class;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION fn_stats_sharing_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_class uuid;
  v_delta int := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_class := NEW.class_id;
    IF NEW.share_planet THEN v_delta := 1; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_class := OLD.class_id;
    IF OLD.share_planet THEN v_delta := -1; END IF;
  ELSE
    v_class := NEW.class_id;
    IF NEW.share_planet AND NOT OLD.share_planet THEN v_delta := 1;
    ELSIF NOT NEW.share_planet AND OLD.share_planet THEN v_delta := -1; END IF;
  END IF;

  IF v_delta = 0 THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id = v_class) THEN RETURN NULL; END IF;

  INSERT INTO class_stats (class_id, shared_planet_count, updated_at) VALUES (v_class, greatest(v_delta, 0), now())
  ON CONFLICT (class_id) DO UPDATE
    SET shared_planet_count = class_stats.shared_planet_count + v_delta, updated_at = now();
  RETURN NULL;
END $$;

-- 活动触发器只做 UPDATE，不会违反外键；但班级被删时直接跳过更省事
CREATE OR REPLACE FUNCTION fn_stats_activity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_evidence_at IS NULL THEN RETURN NULL; END IF;
  ELSIF NEW.last_evidence_at IS NOT DISTINCT FROM OLD.last_evidence_at THEN
    RETURN NULL;
  END IF;

  UPDATE class_stats cs
     SET last_active_at = (SELECT max(ls.last_evidence_at)
                             FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
                            WHERE m.class_id = cs.class_id),
         updated_at = now()
   WHERE cs.class_id IN (SELECT class_id FROM class_members WHERE user_id = NEW.user_id);

  RETURN NULL;
END $$;
