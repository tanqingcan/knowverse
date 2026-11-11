import { z } from "zod";
import { authed } from "@/server/http";
import { weeklyReport } from "@/server/reports";

/** GET /api/reports/weekly?days=7 —— 学习周报（扩展 SQL：窗口函数 / FILTER / GROUPING SETS / 连续天数） */
export const GET = authed(async (req, user) => {
  const url = new URL(req.url);
  const days = z.coerce.number().int().min(1).max(90).parse(url.searchParams.get("days") ?? 7);
  const classId = url.searchParams.get("classId");
  return weeklyReport(user, { days, classId: classId ? z.string().uuid().parse(classId) : undefined });
});
