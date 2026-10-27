import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { myClasses, createClass } from "@/server/classes";
export const GET = authed(async (_req, user) => myClasses(user));
export const POST = authed(async (req, user) => createClass(user, (await parseBody(req, z.object({ name: z.string().max(40) }))).name));
