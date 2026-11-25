import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { findConceptPassages, locationLabel, reviewChunkConcept } from "@/server/materials";

export const GET = authed(async (req, user) => {
  const id = z.string().uuid().parse(req.nextUrl.searchParams.get("conceptId"));
  return (await findConceptPassages(user.id, [id])).map(hit => ({ ...hit, location: locationLabel(hit) }));
});

export const POST = authed(async (req, user) => {
  const input = await parseBody(req, z.object({
    chunkId: z.string().uuid(),
    conceptId: z.string().uuid(),
    status: z.enum(["confirmed", "rejected"]),
  }));
  return reviewChunkConcept(user.id, input.chunkId, input.conceptId, input.status);
});
