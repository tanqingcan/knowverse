import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { generateTask } from "@/server/practice";
export const POST = authed(async (req, user) => generateTask(user.id, (await parseBody(req, z.object({ conceptId: z.string().uuid() }))).conceptId));
export const maxDuration = 60;
