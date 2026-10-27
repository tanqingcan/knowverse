import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { withTx } from "@/db";
import { revokeEvidence } from "@/server/growth";
import { notFound } from "@/server/errors";
export const POST = authed<{ id: string }>(async (req, user, p) => {
  const b = await parseBody(req, z.object({ reason: z.string().min(2).max(200) }));
  const r = await withTx((c) => revokeEvidence(c, user.id, z.string().uuid().parse(p.id), b.reason));
  if (!r) throw notFound("证据");
  return r;
});
