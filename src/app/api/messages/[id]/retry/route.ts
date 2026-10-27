import { z } from "zod";
import { authed } from "@/server/http";
import { generateReply } from "@/server/chat";
export const POST = authed<{ id: string }>(async (_req, user, p) => generateReply(user, z.string().uuid().parse(p.id)));
export const maxDuration = 120;
