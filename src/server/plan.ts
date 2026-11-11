/**
 * 学习路线规划：把「目标 → 先修闭包 → 拓扑排序 → 加权」全部交给数据库函数 fn_plan_path。
 * 应用层只做参数校验与结果整形，排序与推荐理由都在 SQL 里（可被 EXPLAIN、可被测试）。
 */
import { q, q1 } from "@/db";
import type { CurrentUser } from "./auth";
import { notFound } from "./errors";

export type PlanStep = {
  ord: number;
  conceptId: string;
  name: string;
  stage: string;
  depth: number;
  mistakes: number;
  reason: string;
};

export async function planPath(user: CurrentUser, goalConceptId: string, limit = 12) {
  const goal = await q1<{ id: string; name: string }>(
    `SELECT id, name FROM concepts WHERE id = $1 AND (owner_user_id IS NULL OR owner_user_id = $2)`,
    [goalConceptId, user.id],
  );
  if (!goal) throw notFound("知识点");

  const steps = await q<PlanStep>(
    `SELECT ord, concept_id AS "conceptId", name, stage, depth, mistakes, reason
       FROM fn_plan_path($1, $2, $3)`,
    [user.id, goalConceptId, limit],
  );
  return {
    goal,
    steps,
    todoCount: steps.filter((s) => s.stage !== "bloom").length,
    doneCount: steps.filter((s) => s.stage === "bloom").length,
  };
}
