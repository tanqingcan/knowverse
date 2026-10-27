import { z } from "zod";
import { authed } from "@/server/http";
import { materialDetail } from "@/server/materials";
export const GET = authed<{ id: string }>(async (req, user, p) => { const v = req.nextUrl.searchParams.get("v"); return materialDetail(user.id, z.string().uuid().parse(p.id), v ? Number(v) : undefined); });
