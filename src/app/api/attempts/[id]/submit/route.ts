import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { runTool } from "@/server/agent/tools";
/** 提交作答：前端为每次提交生成幂等键，网络重试时复用同一个键，只结算一次 */
export const POST = authed<{ id: string }>(async (req, user, p) => {
  const b = await parseBody(req, z.object({ answer: z.string().min(1).max(8000), submitKey: z.string().min(8).max(80) }));
  return runTool("submit_attempt", { attemptId: z.string().uuid().parse(p.id), ...b }, { userId: user.id, timezone: user.timezone, trace: [] });
});
export const maxDuration = 60;
