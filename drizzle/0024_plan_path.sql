-- 0012：学习路线规划器（扩展 SQL：递归查询 + 拓扑排序 + 加权推荐）
--
-- 课程里的三个点合在一起用：
--   1. 递归 CTE：把「目标知识点 → 它的先修 → 先修的先修」展开成闭包；
--   2. 拓扑排序：按「到目标的距离」倒序排列，保证先修一定排在后继之前（图的 DAG 由防环触发器保证）；
--   3. 加权：同层里按阶段（越弱越靠前）和真实错题数排序，而不是按字母序。
-- 结果不是“所有先修都学一遍”，而是“按你现在的情况，下一步先学什么、为什么”。

CREATE OR REPLACE FUNCTION fn_plan_path(p_user uuid, p_goal uuid, p_limit int DEFAULT 12)
RETURNS TABLE(
  ord int,
  concept_id uuid,
  name text,
  stage text,
  depth int,
  mistakes int,
  reason text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF kv_current_user_id() IS NOT NULL AND p_user <> kv_current_user_id() THEN
    RAISE EXCEPTION 'cannot plan for another user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH RECURSIVE closure(concept_id, depth) AS (
    SELECT p_goal, 0
    UNION
    SELECT cp.prereq_concept_id, closure.depth + 1
      FROM concept_prerequisites cp
      JOIN closure ON cp.concept_id = closure.concept_id
     WHERE closure.depth < 12
  ),
  node AS (
    SELECT c.concept_id, max(c.depth)::int AS depth
      FROM closure c GROUP BY c.concept_id
  ),
  info AS (
    SELECT n.concept_id,
           n.depth,
           k.name,
           coalesce(ls.stage, 'seed') AS stage,
           (SELECT count(*)::int
              FROM attempts a
              JOIN evaluations e ON e.attempt_id = a.id
              JOIN task_versions tv ON tv.id = a.task_version_id
              JOIN task_concepts tc ON tc.task_id = tv.task_id
             WHERE a.user_id = p_user AND tc.concept_id = n.concept_id
               AND e.verdict IN ('incorrect', 'partial')) AS mistakes
      FROM node n
      JOIN concepts k ON k.id = n.concept_id
      LEFT JOIN learning_states ls ON ls.user_id = p_user AND ls.concept_id = n.concept_id
     WHERE k.owner_user_id IS NULL OR k.owner_user_id = p_user
  ),
  ranked AS (
    SELECT i.*,
           CASE i.stage WHEN 'seed' THEN 0 WHEN 'sprout' THEN 1 WHEN 'leaf' THEN 2 WHEN 'bud' THEN 3 ELSE 4 END AS stage_rank
      FROM info i
  )
  SELECT row_number() OVER (
           ORDER BY r.depth DESC, r.stage_rank ASC, r.mistakes DESC, r.name
         )::int,
         r.concept_id,
         r.name,
         r.stage,
         r.depth,
         r.mistakes,
         CASE
           WHEN r.depth = 0 THEN '目标知识点'
           WHEN r.stage = 'bloom' THEN '已开花：可跳过或用来巩固'
           WHEN r.mistakes > 0 THEN '有 ' || r.mistakes || ' 次错题，建议优先补'
           WHEN r.stage = 'bud' THEN '花苞：还差一次独立变式验证'
           ELSE '目标「' || (SELECT k2.name FROM concepts k2 WHERE k2.id = p_goal) || '」的先修'
         END
    FROM ranked r
   ORDER BY r.depth DESC, r.stage_rank ASC, r.mistakes DESC, r.name
   LIMIT p_limit;
END $$;

COMMENT ON FUNCTION fn_plan_path(uuid, uuid, int)
  IS '按先修关系（递归 CTE）生成拓扑序学习路线，同层按阶段与错题数加权；返回每一步的理由';
