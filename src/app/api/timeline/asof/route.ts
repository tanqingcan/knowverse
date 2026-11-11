import { z } from "zod";
import { authed } from "@/server/http";
import { gardenAsOf } from "@/server/world";

/**
 * GET /api/timeline/asof?at=2026-10-20T12:00:00Z
 * 时间机器：按证据有效期重放该时刻的花园（每株花的当时阶段与当前阶段）。
 */
export const GET = authed(async (req, user) => {
  const raw = new URL(req.url).searchParams.get("at");
  const at = raw ? z.coerce.date().parse(raw) : new Date();
  return gardenAsOf(user, at);
});
