import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { selfReport } from "@/server/world";
export const POST = authed(async (req, user) => { const b = await parseBody(req, z.object({ conceptId: z.string().uuid(), text: z.string().max(200) })); return selfReport(user, b.conceptId, b.text); });
