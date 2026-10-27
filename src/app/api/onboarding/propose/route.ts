import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { runTool } from "@/server/agent/tools";
export const POST = authed(async (req, user) => {
  const b = await parseBody(req, z.object({ goalText: z.string().min(1).max(300), subjectId: z.string().uuid() }));
  return runTool("propose_learning_path", b, { userId: user.id, timezone: user.timezone, trace: [] });
});
