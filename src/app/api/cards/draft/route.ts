import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { runTool } from "@/server/agent/tools";
export const POST = authed(async (req, user) => runTool("draft_knowledge_card", await parseBody(req, z.object({ conceptId: z.string().uuid() })), { userId: user.id, timezone: user.timezone, trace: [] }));
