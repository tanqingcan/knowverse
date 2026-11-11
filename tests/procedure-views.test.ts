/**
 * 存储过程 + 子模式（第 8 章 / 第 4.3 视图机制）
 *
 * - CALL kv_nightly_maintenance(7, NULL) 返回 INOUT 报告，内部用了游标、动态 SQL、异常处理；
 * - 教师视图只暴露聚合，kv_teacher 只被授予视图，没有底层表权限。
 */
import { describe, expect, it } from "vitest";
import { q, q1, withTx } from "@/db";

describe("存储过程与子模式", () => {
  it("CALL kv_nightly_maintenance 返回 INOUT 报告，并覆盖四个维护步骤", async () => {
    const rows = await q<{ p_report: any }>(`CALL kv_nightly_maintenance($1, NULL)`, [7]);
    const report = rows[0].p_report;
    expect(Array.isArray(report.analyzed)).toBe(true);
    expect(report.analyzed).toEqual(expect.arrayContaining(["messages", "learning_evidence", "class_stats"]));
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(report.warnings).toHaveLength(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof report.staleMessages).toBe("number");
    expect(typeof report.archivedSessions).toBe("number");
  });

  it("过程会写一条 maintenance.nightly 的 outbox 事件（可被 CDC 消费）", async () => {
    await q(`CALL kv_nightly_maintenance($1, NULL)`, [3]);
    const ev = await q1<{ n: number }>(`SELECT count(*)::int n FROM outbox_events WHERE topic = 'maintenance.nightly'`);
    expect(ev!.n).toBeGreaterThan(0);
  });

  it("教师视图只返回聚合，且数值自洽", async () => {
    const row = await q1<any>(`SELECT * FROM v_teacher_class_overview LIMIT 1`);
    expect(row).toBeTruthy();
    expect(row.member_count).toBeGreaterThan(0);
    expect(row.plant_count).toBeGreaterThanOrEqual(row.member_count * 1);
    expect(row.evidence_count).toBeGreaterThan(0);
    // 不应包含任何个人字段
    expect(Object.keys(row)).not.toContain("display_name");
    expect(Object.keys(row)).not.toContain("user_id");
  });

  it("kv_teacher 只能读视图，读底层表被拒绝（42501）", async () => {
    const viewOk = await withTx(async (c) => {
      await c.query(`SET LOCAL ROLE kv_teacher`);
      const r = await c.query(`SELECT count(*)::int n FROM v_teacher_concept_heat`);
      return Number(r.rows[0].n);
    });
    expect(viewOk).toBeGreaterThan(0);

    await expect(
      withTx(async (c) => {
        await c.query(`SET LOCAL ROLE kv_teacher`);
        return c.query(`SELECT count(*) FROM messages`);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
