/**
 * 学习周报：把“扩展 SQL”这一章用起来。
 *
 * 六个问题，六种写法：
 *   1. 每日活动      —— generate_series + 多源 UNION + FILTER
 *   2. 连续学习天数  —— gaps-and-islands（日期减 row_number 分组）
 *   3. 阶段漏斗      —— count(*) FILTER (WHERE …)
 *   4. 学科汇总      —— GROUPING SETS（小计 + 合计一次算完）
 *   5. 班级百分位    —— percent_rank() 窗口函数
 *   6. 错题排行      —— rank() + 多表连接
 *
 * 全部参数化；时间范围以用户时区为准（这里用 date_trunc 的本地日，演示足够）。
 */
import { q, q1 } from "@/db";
import type { CurrentUser } from "./auth";

export type WeeklyReport = Awaited<ReturnType<typeof weeklyReport>>;

export async function weeklyReport(user: CurrentUser, opts: { days?: number; classId?: string | null } = {}) {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 90);

  // 1) 每日活动：七天里每天一行，没活动也要有 0
  const daily = await q<{ date: string; questions: number; attempts: number; evidences: number; notes: number }>(`
    WITH days AS (
      SELECT generate_series(current_date - ($2::int - 1), current_date, interval '1 day')::date AS d
    ), acts AS (
      SELECT created_at::date AS d, 'message' AS src FROM messages
       WHERE user_id = $1 AND role = 'user' AND created_at >= current_date - ($2::int - 1)
      UNION ALL
      SELECT coalesce(submitted_at, started_at)::date, 'attempt' FROM attempts
       WHERE user_id = $1 AND coalesce(submitted_at, started_at) >= current_date - ($2::int - 1)
      UNION ALL
      SELECT created_at::date, 'evidence' FROM learning_evidence
       WHERE user_id = $1 AND created_at >= current_date - ($2::int - 1)
      UNION ALL
      SELECT created_at::date, 'note' FROM notes
       WHERE user_id = $1 AND created_at >= current_date - ($2::int - 1)
    )
    SELECT days.d::text AS date,
           count(*) FILTER (WHERE src = 'message')::int  AS questions,
           count(*) FILTER (WHERE src = 'attempt')::int  AS attempts,
           count(*) FILTER (WHERE src = 'evidence')::int AS evidences,
           count(*) FILTER (WHERE src = 'note')::int     AS notes
      FROM days LEFT JOIN acts ON acts.d = days.d
     GROUP BY days.d ORDER BY days.d`, [user.id, days]);

  // 2) 连续学习天数：gaps-and-islands
  const streak = await q1<{ current_streak: number; longest_streak: number; last_active: string | null }>(`
    WITH acts AS (
      SELECT DISTINCT created_at::date AS d FROM learning_evidence WHERE user_id = $1
      UNION SELECT DISTINCT created_at::date FROM messages WHERE user_id = $1 AND role = 'user'
      UNION SELECT DISTINCT coalesce(submitted_at, started_at)::date FROM attempts WHERE user_id = $1
    ), grouped AS (
      SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM acts
    ), runs AS (
      SELECT grp, count(*)::int AS len, max(d) AS last_day FROM grouped GROUP BY grp
    )
    SELECT CASE WHEN (SELECT max(d) FROM acts) >= current_date - 1
                THEN coalesce((SELECT len FROM runs ORDER BY last_day DESC LIMIT 1), 0)
                ELSE 0 END AS current_streak,
           coalesce((SELECT max(len) FROM runs), 0) AS longest_streak,
           (SELECT max(d)::text FROM acts) AS last_active`, [user.id]);

  // 3) 阶段漏斗：一棵植物的五个阶段分布
  const funnel = await q1<Record<string, number>>(`
    SELECT count(*)::int AS plants,
           count(*) FILTER (WHERE coalesce(ls.stage, 'seed') = 'seed')::int   AS seed,
           count(*) FILTER (WHERE coalesce(ls.stage, 'seed') = 'sprout')::int AS sprout,
           count(*) FILTER (WHERE coalesce(ls.stage, 'seed') = 'leaf')::int   AS leaf,
           count(*) FILTER (WHERE coalesce(ls.stage, 'seed') = 'bud')::int    AS bud,
           count(*) FILTER (WHERE coalesce(ls.stage, 'seed') = 'bloom')::int  AS bloom
      FROM plants p
      JOIN gardens g ON g.id = p.garden_id
      JOIN planets pl ON pl.id = g.planet_id
      LEFT JOIN learning_states ls ON ls.user_id = $1 AND ls.concept_id = p.concept_id
     WHERE pl.user_id = $1 AND p.archived_at IS NULL`, [user.id]);

  // 4) 学科汇总：GROUPING SETS 一次算出“分学科 + 合计”
  const bySubject = await q<{ subject: string; asked: number; practice: number; total: number }>(`
    SELECT coalesce(s.name, '合计') AS subject,
           count(*) FILTER (WHERE e.kind = 'asked')::int AS asked,
           count(*) FILTER (WHERE e.kind IN ('guided_practice','independent_attempt','independent_variant_pass'))::int AS practice,
           count(*)::int AS total
      FROM learning_evidence e
      JOIN concepts k ON k.id = e.concept_id
      JOIN subjects s ON s.id = k.subject_id
     WHERE e.user_id = $1 AND e.created_at >= current_date - ($2::int - 1)
     GROUP BY GROUPING SETS ((s.name), ())
     ORDER BY (s.name IS NULL), s.name`, [user.id, days]);

  // 5) 班级百分位：自己在同学中的证据数排名
  let classRank: { percentile: number; evidenceCount: number; rnk: number; total: number; classId: string; className: string } | null = null;
  const classId = opts.classId ?? (await q1<{ class_id: string }>(
    `SELECT class_id FROM class_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1`, [user.id]))?.class_id;
  if (classId) {
    classRank = (await q1<any>(`
      WITH per_member AS (
        SELECT m.user_id, count(e.id)::int AS evidence_count
          FROM class_members m
          LEFT JOIN learning_evidence e ON e.user_id = m.user_id
         WHERE m.class_id = $2
         GROUP BY m.user_id
      ), ranked AS (
        -- 窗口函数先算全班，再筛选自己（WHERE 若写在同一层会先过滤，窗口就只剩自己一行）
        SELECT user_id, evidence_count,
               percent_rank() OVER (ORDER BY evidence_count) AS pr,
               rank() OVER (ORDER BY evidence_count DESC)::int AS rnk,
               count(*) OVER ()::int AS total
          FROM per_member
      )
      SELECT round(pr::numeric, 2)::float AS percentile,
             evidence_count AS "evidenceCount",
             rnk, total,
             $2::uuid AS "classId",
             (SELECT name FROM classes WHERE id = $2) AS "className"
        FROM ranked WHERE user_id = $1`, [user.id, classId])) as any;
  }

  // 6) 错题排行：最近 30 天，按知识点聚合排名
  const topMistakes = await q<{ concept: string; mistakes: number; rnk: number }>(`
    SELECT k.name AS concept,
           count(*)::int AS mistakes,
           rank() OVER (ORDER BY count(*) DESC)::int AS rnk
      FROM attempts a
      JOIN evaluations ev ON ev.attempt_id = a.id
      JOIN task_versions tv ON tv.id = a.task_version_id
      JOIN task_concepts tc ON tc.task_id = tv.task_id
      JOIN concepts k ON k.id = tc.concept_id
     WHERE a.user_id = $1 AND ev.verdict IN ('incorrect', 'partial')
       AND coalesce(a.submitted_at, a.started_at) >= current_date - 29
     GROUP BY k.name
     ORDER BY mistakes DESC, k.name
     LIMIT 5`, [user.id]);

  return {
    range: { days, from: daily[0]?.date ?? null, to: daily[daily.length - 1]?.date ?? null },
    daily,
    streak,
    funnel,
    bySubject,
    classRank,
    topMistakes,
    summary: {
      activeDays: daily.filter((d) => d.questions + d.attempts + d.evidences + d.notes > 0).length,
      questions: daily.reduce((a, d) => a + d.questions, 0),
      attempts: daily.reduce((a, d) => a + d.attempts, 0),
      bloomed: funnel?.bloom ?? 0,
    },
  };
}
