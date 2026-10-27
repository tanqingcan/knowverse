import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { startAttempt } from "@/server/practice";
export const POST = authed(async (req, user) => { const b = await parseBody(req, z.object({ taskVersionId: z.string().uuid(), mode: z.enum(["guided", "independent", "diagnostic"]) })); return startAttempt(user.id, b.taskVersionId, b.mode); });
