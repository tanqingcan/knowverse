import { z } from "zod";
import { authed } from "@/server/http";
import { galaxy } from "@/server/classes";
export const GET = authed<{ id: string }>(async (_req, user, p) => galaxy(user, z.string().uuid().parse(p.id)));
