import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { sendMessage } from "@/server/chat";
export const POST = authed(async (req, user) => sendMessage(user, await parseBody(req, z.object({ conversationId: z.string().uuid().nullable().optional(), text: z.string().min(1).max(4000), focusConceptId: z.string().uuid().nullable().optional(), subjectId: z.string().uuid().nullable().optional() }))));
export const maxDuration = 120;
