import { z } from "zod";
import { authed, parseBody } from "@/server/http";
import { correctMemory, deleteMemory } from "@/server/memories";

export const DELETE = authed<{ id: string }>(async (_req, user, p) => deleteMemory(user, z.string().uuid().parse(p.id)));

export const PATCH = authed<{ id: string }>(async (req, user, p) =>
  correctMemory(user, z.string().uuid().parse(p.id), (await parseBody(req, z.object({ content: z.string().min(1).max(8000) }))).content),
);
