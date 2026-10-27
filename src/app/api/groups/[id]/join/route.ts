import { z } from "zod";
import { authed } from "@/server/http";
import { joinGroup } from "@/server/classes";
export const POST = authed<{ id: string }>(async (_req, user, p) => joinGroup(user.id, z.string().uuid().parse(p.id)));
