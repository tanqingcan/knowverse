import { z } from "zod";
import { authed } from "@/server/http";
import { takeHint } from "@/server/practice";
export const POST = authed<{ id: string }>(async (_req, user, p) => takeHint(user.id, z.string().uuid().parse(p.id)));
