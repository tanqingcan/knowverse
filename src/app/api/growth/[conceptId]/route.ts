import { authed } from "@/server/http";
import { runTool } from "@/server/agent/tools";
export const GET = authed<{ conceptId: string }>(async (_req, user, p) => runTool("get_growth_explanation", { conceptId: p.conceptId }, { userId: user.id, timezone: user.timezone, trace: [] }));
