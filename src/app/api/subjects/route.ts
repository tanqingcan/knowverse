import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { listSubjects, createSubject } from "@/server/world";
export const GET = authed(async (_req, user) => listSubjects(user.id));
export const POST = authed(async (req, user) => createSubject(user, (await parseBody(req, z.object({ name: z.string().min(1).max(30) }))).name));
