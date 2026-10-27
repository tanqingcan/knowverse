import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { listCards, saveCard } from "@/server/classes";
export const GET = authed(async (_req, user) => listCards(user));
export const POST = authed(async (req, user) => saveCard(user, await parseBody(req, z.object({ cardId: z.string().uuid().optional(), conceptId: z.string().uuid(), title: z.string().min(1).max(80), body: z.string().min(1).max(8000), changeNote: z.string().max(200).optional(), draftedBy: z.enum(["user", "ai_draft"]).default("user"), sourceMessageIds: z.array(z.string().uuid()).max(10).default([]) }))));
