import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { setMaterialConcept } from "@/server/materials";
export const POST = authed(async (req, user) => { const b = await parseBody(req, z.object({ versionId: z.string().uuid(), conceptId: z.string().uuid(), status: z.enum(["confirmed", "rejected"]) })); return setMaterialConcept(user.id, b.versionId, b.conceptId, b.status); });
