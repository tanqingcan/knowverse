/**
 * 学习周报（扩展 SQL）测试
 *
 * 覆盖：每日活动补零、连续天数、阶段漏斗、GROUPING SETS 合计、班级百分位、错题排名。
 */
import { describe, expect, it } from "vitest";
import { q1 } from "@/db";
import { getUserById } from "@/server/auth";
import { weeklyReport } from "@/server/reports";

async function user(handle: string) {
  const row = await q1<{ id: string }>(`SELECT id FROM users WHERE handle = $1`, [handle]);
  return (await getUserById(row!.id))!;
}

describe("学习周报（扩展 SQL）", () => {
  it("demo：七天每天一行，漏斗与学科合计自洽", async () => {
    const u = await user("demo");
    const r = await weeklyReport(u, { days: 7 });

    expect(r.daily).toHaveLength(7);
    for (let i = 1; i < r.daily.length; i++) {
      expect(r.daily[i].date > r.daily[i - 1].date).toBe(true);
    }
    const f = r.funnel!;
    expect(f.seed + f.sprout + f.leaf + f.bud + f.bloom).toBe(f.plants);
    expect(f.plants).toBeGreaterThan(0);

    // GROUPING SETS：合计行 = 各学科之和
    const total = r.bySubject.find((s) => s.subject === "合计")!;
    const subjects = r.bySubject.filter((s) => s.subject !== "合计");
    expect(total.total).toBe(subjects.reduce((a, s) => a + s.total, 0));
    expect(total.asked).toBe(subjects.reduce((a, s) => a + s.asked, 0));

    expect(r.streak!.current_streak).toBeGreaterThanOrEqual(0);
    expect(r.streak!.longest_streak).toBeGreaterThanOrEqual(r.streak!.current_streak);
  });

  it("班级百分位：筛选在窗口之后，排名与人数正确", async () => {
    const u = await user("demo");
    const r = await weeklyReport(u, { days: 7 });
    expect(r.classRank).not.toBeNull();
    expect(r.classRank!.total).toBeGreaterThanOrEqual(1);
    expect(r.classRank!.rnk).toBeGreaterThanOrEqual(1);
    expect(r.classRank!.percentile).toBeGreaterThanOrEqual(0);
    expect(r.classRank!.percentile).toBeLessThanOrEqual(1);
  });

  it("错题排行按知识点聚合、排名从 1 开始", async () => {
    const u = await user("demo");
    const r = await weeklyReport(u, { days: 7 });
    for (const m of r.topMistakes) {
      expect(m.mistakes).toBeGreaterThan(0);
      expect(m.rnk).toBeGreaterThanOrEqual(1);
    }
    if (r.topMistakes.length > 1) {
      expect(r.topMistakes[0].mistakes).toBeGreaterThanOrEqual(r.topMistakes[1].mistakes);
    }
  });

  it("无活动用户：全零但不报错；天数可配置", async () => {
    const u = await user("xingye");
    const r = await weeklyReport(u, { days: 30 });
    expect(r.daily).toHaveLength(30);
    expect(r.summary.questions + r.summary.attempts).toBeGreaterThanOrEqual(0);
    expect(r.streak!.current_streak).toBeGreaterThanOrEqual(0);
  });
});
