import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { onboard } from "@/server/world";
export const POST = authed(async (req, user) => onboard(user, await parseBody(req, z.object({
  planetName: z.string().max(24), goalTitle: z.string().min(1).max(120), subjectId: z.string().uuid(),
  conceptIds: z.array(z.string().uuid()).max(10), newConceptNames: z.array(z.string().max(40)).max(6),
  natal: z.object({ conceptRef: z.string(), species: z.string(), color: z.string(), nickname: z.string().max(16) }),
}))));
