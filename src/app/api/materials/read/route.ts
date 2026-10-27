import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { markRead } from "@/server/materials";
export const POST = authed(async (req, user) => { const b = await parseBody(req, z.object({ versionId: z.string().uuid(), conceptId: z.string().uuid() })); return markRead(user.id, b.versionId, b.conceptId); });
