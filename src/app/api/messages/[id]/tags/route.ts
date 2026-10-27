import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { setTag } from "@/server/chat";
export const POST = authed<{ id: string }>(async (req, user, p) => { const b = await parseBody(req, z.object({ conceptId: z.string().uuid(), status: z.enum(["confirmed", "rejected"]) })); return setTag(user, z.string().uuid().parse(p.id), b.conceptId, b.status); });
