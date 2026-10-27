import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { addContribution } from "@/server/classes";
export const POST = authed<{ id: string }>(async (req, user, p) => { const b = await parseBody(req, z.object({ kind: z.enum(["explanation", "question", "review"]), content: z.string().max(2000) })); return addContribution(user, z.string().uuid().parse(p.id), b.kind, b.content); });
