-- 0015：修正教师子模式的班级概览视图
-- 0014 里 plant_count 错用了 planets 的条数（一个用户只有一颗星球），应统计成员花圃里的植物数。

CREATE OR REPLACE VIEW v_teacher_class_overview AS
SELECT c.id AS class_id,
       c.name AS class_name,
       (SELECT count(*) FROM class_members m WHERE m.class_id = c.id)::int AS member_count,
       (SELECT count(*)
          FROM class_members m
          JOIN planets pl ON pl.user_id = m.user_id
          JOIN gardens g ON g.planet_id = pl.id
          JOIN plants p ON p.garden_id = g.id
         WHERE m.class_id = c.id AND p.archived_at IS NULL)::int AS plant_count,
       (SELECT count(*)
          FROM class_members m
          JOIN learning_evidence e ON e.user_id = m.user_id
         WHERE m.class_id = c.id)::int AS evidence_count,
       (SELECT max(ls.last_evidence_at)
          FROM class_members m
          JOIN learning_states ls ON ls.user_id = m.user_id
         WHERE m.class_id = c.id) AS last_active_at
FROM classes c;

COMMENT ON VIEW v_teacher_class_overview IS '教师子模式：只读班级聚合（成员数/植物数/证据数/最近活跃），不含个人内容';
