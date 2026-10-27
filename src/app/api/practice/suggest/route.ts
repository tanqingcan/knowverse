import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { runTool } from "@/server/agent/tools";
export const POST = authed(async (req, user) => runTool("create_practice", await parseBody(req, z.object({ conceptId: z.string().uuid().optional(), subjectId: z.string().uuid().optional() })), { userId: user.id, timezone: user.timezone, trace: [] }));
