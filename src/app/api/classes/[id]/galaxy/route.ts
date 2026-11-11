import { z } from "zod";
import { authed } from "@/server/http";
import { galaxy } from "@/server/classes";

/** 与 /api/classes/[id] 同一份数据，保留独立路径给多球宇宙场景使用 */
export const GET = authed<{ id: string }>(async (_req, user, p) => galaxy(user, z.string().uuid().parse(p.id)));
