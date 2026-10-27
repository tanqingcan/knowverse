import { z } from "zod";
import { authed } from "@/server/http";
import { withdrawIntent } from "@/server/classes";
export const DELETE = authed<{ id: string }>(async (_req, user, p) => withdrawIntent(user, z.string().uuid().parse(p.id)));
