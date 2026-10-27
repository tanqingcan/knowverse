import { authed } from "@/server/http";
import { runTool } from "@/server/agent/tools";
export const GET = authed<{ id: string }>(async (_req, user, p) => runTool("find_learning_partners", { classId: p.id }, { userId: user.id, timezone: user.timezone, trace: [] }));
