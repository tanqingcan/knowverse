import { z } from "zod";
import { authed } from "@/server/http";
import { classCards } from "@/server/classes";
export const GET = authed<{ id: string }>(async (_req, user, p) => classCards(user, z.string().uuid().parse(p.id)));
