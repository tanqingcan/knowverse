import { z } from "zod";
import { authed } from "@/server/http";
import { planPath } from "@/server/plan";

/**
 * GET /api/goals/plan?goal=<conceptId>&limit=12
 * 按先修关系生成「下一步学什么」的拓扑路线，并给出每一步的理由。
 */
export const GET = authed(async (req, user) => {
  const url = new URL(req.url);
  const goal = z.string().uuid().parse(url.searchParams.get("goal"));
  const limit = z.coerce.number().int().min(1).max(30).parse(url.searchParams.get("limit") ?? 12);
  return planPath(user, goal, limit);
});
