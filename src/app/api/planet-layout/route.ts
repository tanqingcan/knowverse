import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { getLayout, saveDraft } from "@/server/layouts";

const itemSchema = z.object({
  kind: z.string(),
  x: z.number(), z: z.number(),
  rot: z.number().optional(), scale: z.number().optional(),
  width: z.number().nullish(), length: z.number().nullish(),
  color: z.string().nullish(), stage: z.string().nullish(),
});

export const GET = authed(async (_req, user) => getLayout(user));

export const PUT = authed(async (req, user) => {
  const body = await parseBody(req, z.object({ baseRevision: z.number().int().min(0), items: z.array(itemSchema).max(300) }));
  return saveDraft(user, body.baseRevision, body.items);
});
