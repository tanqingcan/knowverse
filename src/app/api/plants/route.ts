import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { addPlant } from "@/server/world";
export const POST = authed(async (req, user) => addPlant(user, await parseBody(req, z.object({ conceptId: z.string().uuid().optional(), subjectId: z.string().uuid().optional(), name: z.string().max(40).optional(), species: z.string().optional(), color: z.string().optional() }))));
