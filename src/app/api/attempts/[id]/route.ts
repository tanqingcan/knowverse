import { z } from "zod";
import { authed } from "@/server/http";
import { attemptView } from "@/server/practice";
export const GET = authed<{ id: string }>(async (_req, user, p) => attemptView(user.id, z.string().uuid().parse(p.id)));
