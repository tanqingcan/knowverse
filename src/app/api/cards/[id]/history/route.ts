import { z } from "zod";
import { authed } from "@/server/http";
import { cardHistory } from "@/server/classes";
export const GET = authed<{ id: string }>(async (_req, user, p) => cardHistory(user, z.string().uuid().parse(p.id)));
