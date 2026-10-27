import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { publishCard } from "@/server/classes";
export const POST = authed(async (req, user) => { const b = await parseBody(req, z.object({ versionId: z.string().uuid(), classId: z.string().uuid() })); return publishCard(user, b.versionId, b.classId); });
