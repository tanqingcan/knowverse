import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { joinClass } from "@/server/classes";
export const POST = authed(async (req, user) => joinClass(user, (await parseBody(req, z.object({ code: z.string().max(12) }))).code));
