import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { conversationWindow, renameConversation, archiveConversation } from "@/server/chat";
export const GET = authed<{ id: string }>(async (req, user, p) => {
  const sp = req.nextUrl.searchParams;
  const around = sp.get("around"); const before = sp.get("before");
  return conversationWindow(user.id, z.string().uuid().parse(p.id), { aroundMessageId: around ? z.string().uuid().parse(around) : undefined, beforeSeq: before ? Number(before) : undefined });
});
export const PATCH = authed<{ id: string }>(async (req, user, p) => renameConversation(user, z.string().uuid().parse(p.id), (await parseBody(req, z.object({ title: z.string().max(60) }))).title));
export const DELETE = authed<{ id: string }>(async (_req, user, p) => archiveConversation(user, z.string().uuid().parse(p.id)));
