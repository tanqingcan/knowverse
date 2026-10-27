import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { addIntent, myIntents } from "@/server/classes";
export const GET = authed<{ id: string }>(async (_req, user, p) => myIntents(user, z.string().uuid().parse(p.id)));
export const POST = authed<{ id: string }>(async (req, user, p) => addIntent(user, { classId: z.string().uuid().parse(p.id), ...(await parseBody(req, z.object({ conceptId: z.string().uuid(), direction: z.enum(["seek", "offer"]), note: z.string().max(120).optional() }))) }));
