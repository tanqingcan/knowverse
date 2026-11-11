-- 0003：视图、物化视图与「班级星系」的数据库侧收口
--
-- 设计要点：
--   1. 班级星系是唯一的跨用户读场景。它不能靠应用层过滤，也不能给 kv_app 直接开表，
--      因此用一个 SECURITY DEFINER 函数 fn_class_galaxy(p_user, p_class)：
--      - 在函数内部校验成员资格（不是成员直接 42501）；
--      - 只返回“本人 + 明确打开 share_planet 的成员”；
--      - 函数所有者是表所有者，能穿过 RLS，而调用者只能拿到函数返回的行。
--   2. v_material_citation 用 security_invoker = true，让查询者自身的 RLS 生效，
--      这样它只可能看到自己消息上的引用（给 C 的检索/引用校验复用）。
--   3. mv_class_stats 是物化视图，用于班级榜单类读多写少的聚合；用唯一索引支持
--      REFRESH MATERIALIZED VIEW CONCURRENTLY（不阻塞读）。

/* ───────── 1. 班级星系：跨用户读的唯一入口 ───────── */
CREATE OR REPLACE FUNCTION fn_class_galaxy(p_user uuid, p_class uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_class jsonb;
  v_members jsonb;
  v_total int;
BEGIN
  SELECT m.role INTO v_role FROM class_members m WHERE m.class_id = p_class AND m.user_id = p_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of class %', p_class USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'joinCode', c.join_code)
    INTO v_class FROM classes c WHERE c.id = p_class;

  SELECT count(*)::int INTO v_total FROM class_members WHERE class_id = p_class;

  WITH visible AS (
    SELECT m.user_id,
           u.display_name,
           m.role,
           m.joined_at,
           coalesce(sp.share_planet, false) AS share_planet,
           coalesce(sp.share_stages, false) AS share_stages,
           pl.id AS planet_id,
           pl.name AS planet_name,
           np.species AS natal_species,
           np.color AS natal_color,
           (SELECT count(*) FROM plants p2 JOIN gardens g2 ON g2.id = p2.garden_id
             WHERE g2.planet_id = pl.id AND p2.archived_at IS NULL)::int AS plant_count,
           (SELECT max(ls.last_evidence_at) FROM learning_states ls WHERE ls.user_id = m.user_id) AS last_active_at
    FROM class_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN sharing_preferences sp ON sp.class_id = m.class_id AND sp.user_id = m.user_id
    LEFT JOIN planets pl ON pl.user_id = m.user_id
    LEFT JOIN plants np ON np.id = pl.natal_plant_id
    WHERE m.class_id = p_class
      AND (m.user_id = p_user OR coalesce(sp.share_planet, false))
    ORDER BY m.joined_at
  )
  SELECT coalesce(jsonb_agg(to_jsonb(visible)), '[]'::jsonb) INTO v_members FROM visible;

  RETURN jsonb_build_object(
    'class', v_class,
    'members', v_members,
    'visibleCount', jsonb_array_length(v_members),
    'memberCount', v_total
  );
END $$;

COMMENT ON FUNCTION fn_class_galaxy(uuid, uuid) IS '班级星系的唯一跨用户读入口：校验成员资格，只返回本人与明确分享星球的成员';

/* ───────── 2. 引用定位视图（跟随查询者的 RLS） ───────── */
CREATE OR REPLACE VIEW v_material_citation
WITH (security_invoker = true)
AS
SELECT mc.id,
       mc.message_id,
       mc.chunk_id,
       mc.ref_label,
       ch.page_no,
       ch.paragraph_no,
       ch.heading,
       v.id AS version_id,
       v.version_no,
       v.file_type,
       mat.id AS material_id,
       mat.title AS material_title,
       mat.course
FROM message_citations mc
JOIN material_chunks ch ON ch.id = mc.chunk_id
JOIN material_versions v ON v.id = ch.version_id
JOIN materials mat ON mat.id = v.material_id;

COMMENT ON VIEW v_material_citation IS '消息→片段→版本→资料 的引用定位视图；security_invoker，继承查询者的行级安全';

/* ───────── 3. 班级统计物化视图 ───────── */
CREATE MATERIALIZED VIEW mv_class_stats AS
SELECT c.id AS class_id,
       c.name,
       (SELECT count(*) FROM class_members m WHERE m.class_id = c.id)::int AS member_count,
       (SELECT count(*) FROM class_members m
          JOIN sharing_preferences sp ON sp.class_id = m.class_id AND sp.user_id = m.user_id
         WHERE m.class_id = c.id AND sp.share_planet)::int AS shared_planet_count,
       (SELECT max(ls.last_evidence_at)
          FROM class_members m JOIN learning_states ls ON ls.user_id = m.user_id
         WHERE m.class_id = c.id) AS last_active_at
FROM classes c;

CREATE UNIQUE INDEX mv_class_stats_class_id_uq ON mv_class_stats (class_id);

COMMENT ON MATERIALIZED VIEW mv_class_stats IS '班级统计（成员数/分享数/最近活跃），用 REFRESH ... CONCURRENTLY 刷新';
