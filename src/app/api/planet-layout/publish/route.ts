import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { publishLayout } from "@/server/layouts";

export const POST = authed(async (req, user) => {
  const body = await parseBody(req, z.object({ baseRevision: z.number().int().min(0) }));
  return publishLayout(user, body.baseRevision);
});
