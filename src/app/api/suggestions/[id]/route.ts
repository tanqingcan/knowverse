import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { acceptSuggestion, dismissSuggestion } from "@/server/chat";
export const POST = authed<{ id: string }>(async (req, user, p) => {
  const b = await parseBody(req, z.object({ action: z.enum(["accept", "dismiss"]), subjectId: z.string().uuid().optional(), name: z.string().max(40).optional() }));
  const id = z.string().uuid().parse(p.id);
  return b.action === "accept" ? acceptSuggestion(user, id, b) : dismissSuggestion(user, id);
});
