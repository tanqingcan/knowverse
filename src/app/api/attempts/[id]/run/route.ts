import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { previewSql } from "@/server/practice";
export const POST = authed<{ id: string }>(async (req, user, p) => previewSql(user.id, z.string().uuid().parse(p.id), (await parseBody(req, z.object({ sql: z.string().max(4000) }))).sql));
