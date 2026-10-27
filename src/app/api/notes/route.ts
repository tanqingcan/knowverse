import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { createNote } from "@/server/world";
export const POST = authed(async (req, user) => createNote(user, await parseBody(req, z.object({ conceptId: z.string().uuid(), title: z.string().max(60), content: z.string().max(8000), sourceMessageId: z.string().uuid().nullable().optional() }))));
