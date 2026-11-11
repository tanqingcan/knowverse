-- 0008：增量物化维护——班级统计不再全量刷新
--
-- mv_class_stats 是全量物化视图，数据一变就要 REFRESH；这里改成“表 + 触发器增量维护”：
--   · class_members 增删      → member_count ±1
--   · sharing_preferences 变化 → shared_planet_count ±1（只按 share_planet 的真假变化算）
--   · learning_states 活跃时间 → 更新该用户所在班级的 last_active_at（取 max）
-- 增量维护最怕“算漏了”，所以同时提供：
--   · v_class_stats_drift：增量值与真实聚合的差异（只读，用于告警）
--   · fn_reconcile_class_stats()：按真实聚合修复，返回修复行数（幂等）
-- 这样即使触发器漏掉一次，也能被对账发现并修回来——这才是能上线的增量维护。

CREATE TABLE class_stats (
  class_id uuid PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  member_count integer NOT NULL DEFAULT 0,
  shared_planet_count integer NOT NULL DEFAULT 0,
  last_active_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_stats_nonneg_ck CHECK (member_count >= 0 AND shared_planet_count >= 0)
);

-- 从现有数据回填
INSERT INTO class_stats (class_id, member_count, shared_planet_count, last_active_at)
SELECT c.id,
       (SELECT count(*) FROM class_members m WHERE m.class_id = c.id)::int,
       (SELECT count(*) FROM class_members m
          JOIN sharing_preferences sp ON sp.class_id = m.class_id AND sp.user_id = m.user_id
         WHERE m.class_id = c.id AND sp.share_planet)::int,
       (SELECT max(ls.last_evidence_at)
          FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
         WHERE m.class_id = c.id)
FROM classes c
ON CONFLICT (class_id) DO NOTHING;

/* ───────── 1. 成员数 ───────── */
CREATE OR REPLACE FUNCTION fn_stats_member_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_class uuid;
  v_delta int;
BEGIN
  IF TG_OP = 'INSERT' THEN v_class := NEW.class_id; v_delta := 1;
  ELSE v_class := OLD.class_id; v_delta := -1; END IF;

  INSERT INTO class_stats (class_id, member_count, updated_at) VALUES (v_class, greatest(v_delta, 0), now())
  ON CONFLICT (class_id) DO UPDATE
    SET member_count = class_stats.member_count + v_delta, updated_at = now();
  RETURN NULL;
END $$;

CREATE TRIGGER class_members_stats
  AFTER INSERT OR DELETE ON class_members
  FOR EACH ROW EXECUTE FUNCTION fn_stats_member_change();

/* ───────── 2. 分享星球数 ───────── */
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

  IF v_delta <> 0 THEN
    INSERT INTO class_stats (class_id, shared_planet_count, updated_at) VALUES (v_class, greatest(v_delta, 0), now())
    ON CONFLICT (class_id) DO UPDATE
      SET shared_planet_count = class_stats.shared_planet_count + v_delta, updated_at = now();
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER sharing_preferences_stats
  AFTER INSERT OR UPDATE OR DELETE ON sharing_preferences
  FOR EACH ROW EXECUTE FUNCTION fn_stats_sharing_change();

/* ───────── 3. 最近活跃（只增不减） ───────── */
CREATE OR REPLACE FUNCTION fn_stats_activity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_evidence_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.last_evidence_at IS NULL OR NEW.last_evidence_at > OLD.last_evidence_at) THEN
    UPDATE class_stats cs
       SET last_active_at = greatest(coalesce(cs.last_active_at, NEW.last_evidence_at), NEW.last_evidence_at),
           updated_at = now()
      FROM class_members m
     WHERE m.class_id = cs.class_id AND m.user_id = NEW.user_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER learning_states_stats
  AFTER INSERT OR UPDATE OF last_evidence_at ON learning_states
  FOR EACH ROW EXECUTE FUNCTION fn_stats_activity();

/* ───────── 4. 对账视图与修复函数 ───────── */
CREATE OR REPLACE VIEW v_class_stats_drift AS
WITH truth AS (
  SELECT c.id AS class_id,
         (SELECT count(*) FROM class_members m WHERE m.class_id = c.id)::int AS member_count,
         (SELECT count(*) FROM class_members m
            JOIN sharing_preferences sp ON sp.class_id = m.class_id AND sp.user_id = m.user_id
           WHERE m.class_id = c.id AND sp.share_planet)::int AS shared_planet_count,
         (SELECT max(ls.last_evidence_at)
            FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
           WHERE m.class_id = c.id) AS last_active_at
  FROM classes c
)
SELECT t.class_id,
       t.member_count AS truth_members, coalesce(cs.member_count, 0) AS stats_members,
       t.shared_planet_count AS truth_shared, coalesce(cs.shared_planet_count, 0) AS stats_shared,
       t.last_active_at AS truth_active, cs.last_active_at AS stats_active
FROM truth t LEFT JOIN class_stats cs ON cs.class_id = t.class_id
WHERE cs.class_id IS NULL
   OR cs.member_count <> t.member_count
   OR cs.shared_planet_count <> t.shared_planet_count
   OR cs.last_active_at IS DISTINCT FROM t.last_active_at;

CREATE OR REPLACE FUNCTION fn_reconcile_class_stats() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_rows int;
BEGIN
  INSERT INTO class_stats (class_id, member_count, shared_planet_count, last_active_at, updated_at)
  SELECT class_id, truth_members, truth_shared, truth_active, now() FROM v_class_stats_drift
  ON CONFLICT (class_id) DO UPDATE
    SET member_count = EXCLUDED.member_count,
        shared_planet_count = EXCLUDED.shared_planet_count,
        last_active_at = EXCLUDED.last_active_at,
        updated_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;

COMMENT ON TABLE class_stats IS '班级统计的增量维护表（触发器维护 + 对账修复），替代全量物化视图刷新';
COMMENT ON VIEW v_class_stats_drift IS '增量值与真实聚合的差异；为空表示一致';
COMMENT ON FUNCTION fn_reconcile_class_stats() IS '按真实聚合修复 class_stats，返回修复行数（幂等）';
