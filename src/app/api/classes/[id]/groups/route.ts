import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { listGroups } from "@/server/classes";
import { runTool } from "@/server/agent/tools";
export const GET = authed<{ id: string }>(async (_req, user, p) => listGroups(user, z.string().uuid().parse(p.id)));
export const POST = authed<{ id: string }>(async (req, user, p) => runTool("create_collaboration_session", { classId: p.id, ...(await parseBody(req, z.object({ conceptId: z.string().uuid(), title: z.string().max(60), capacity: z.number().int() }))) }, { userId: user.id, timezone: user.timezone, trace: [] }));
