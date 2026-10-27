/** 练习、证据与成长：幂等提交、并发重复提交、事务回滚、成长规则、受限 SQL 沙箱 */
import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "pg";
import { q, q1, makeUser, concept, taskVersion, stageOf } from "./helpers";
import { startAttempt, submitAttemptSafe, takeHint, createPractice, readyTasks, reviewSummary } from "@/server/practice";
import { runSandboxSql, checkSql } from "@/server/sandbox";
import { withTx } from "@/db";
import { addEvidence, revokeEvidence, computeStage } from "@/server/growth";
import { selfReport } from "@/server/world";
import type { CurrentUser } from "@/server/auth";

const GOOD_VARIANT = "SELECT c.title, COUNT(e.sid) AS n FROM courses c LEFT JOIN enrollments e ON e.cid = c.cid AND e.term = '2026秋' AND e.score >= 80 GROUP BY c.cid, c.title";
const WRONG_GUIDED = "SELECT s.name, COUNT(e.cid) AS n FROM students s LEFT JOIN enrollments e ON e.sid = s.sid WHERE e.term = '2026秋' GROUP BY s.sid, s.name";
const GOOD_GUIDED = "SELECT s.name, COUNT(e.cid) AS n FROM students s LEFT JOIN enrollments e ON e.sid = s.sid AND e.term = '2026秋' GROUP BY s.sid, s.name";

let U: CurrentUser;
let leftJoin: string;
beforeAll(async () => { U = await makeUser("prac"); leftJoin = await concept("左外连接"); });

const count = async (sql: string, p: unknown[]) => (await q1(sql, p)).n as number;

describe("作答提交与幂等", () => {
  it("同一幂等键重复提交只结算一次，返回同一结果", async () => {
    const a = await startAttempt(U.id, await taskVersion("每位学生的本学期选课数"), "guided");
    const r1 = await submitAttemptSafe(U.id, a.attempt.id, WRONG_GUIDED, "key-idem-000001");
    const r2 = await submitAttemptSafe(U.id, a.attempt.id, WRONG_GUIDED, "key-idem-000001");
    expect(r1.idempotentReplay).toBe(false);
    expect(r2.idempotentReplay).toBe(true);
    expect(r2.evaluation.verdict).toBe(r1.evaluation.verdict);
    expect(await count(`SELECT count(*)::int n FROM evaluations WHERE attempt_id = $1`, [a.attempt.id])).toBe(1);
    expect(await count(`SELECT count(*)::int n FROM learning_evidence WHERE attempt_id = $1`, [a.attempt.id])).toBe(r1.evidence.length);
    // 换一个键再次提交同一次作答：拒绝
    await expect(submitAttemptSafe(U.id, a.attempt.id, GOOD_GUIDED, "key-idem-000002")).rejects.toMatchObject({ code: "already_submitted" });
  });

  it("并发重复提交（同一键）只产生一条评价与一组证据", async () => {
    const a = await startAttempt(U.id, await taskVersion("找出没有选课的学生"), "independent");
    const rs = await Promise.all(Array.from({ length: 5 }, () => submitAttemptSafe(U.id, a.attempt.id, "SELECT s.name FROM students s LEFT JOIN enrollments e ON e.sid = s.sid WHERE e.sid IS NULL", "key-concurrent-01").catch((e) => e)));
    expect(rs.filter((r: any) => r?.evaluation).length).toBe(5);
    expect(await count(`SELECT count(*)::int n FROM evaluations WHERE attempt_id = $1`, [a.attempt.id])).toBe(1);
    const ev = await q(`SELECT concept_id, kind FROM learning_evidence WHERE attempt_id = $1`, [a.attempt.id]);
    expect(new Set(ev.map((e) => e.concept_id + e.kind)).size).toBe(ev.length);
  });

  it("事务中途失败：评价、证据、状态、成长事件全部回滚，作答仍可安全重试", async () => {
    const a = await startAttempt(U.id, await taskVersion("每门课程的高分人数（变式）"), "independent");
    const stageBefore = await stageOf(U.id, leftJoin);
    const geBefore = await count(`SELECT count(*)::int n FROM growth_events WHERE user_id = $1`, [U.id]);
    const obBefore = await count(`SELECT count(*)::int n FROM outbox_events`, []);
    await expect(submitAttemptSafe(U.id, a.attempt.id, GOOD_VARIANT, "key-fault-000001", { faultAfterEvidence: true })).rejects.toMatchObject({ code: "injected_fault" });
    expect(await count(`SELECT count(*)::int n FROM evaluations WHERE attempt_id = $1`, [a.attempt.id])).toBe(0);
    expect(await count(`SELECT count(*)::int n FROM learning_evidence WHERE attempt_id = $1`, [a.attempt.id])).toBe(0);
    expect(await count(`SELECT count(*)::int n FROM growth_events WHERE user_id = $1`, [U.id])).toBe(geBefore);
    expect(await count(`SELECT count(*)::int n FROM outbox_events`, [])).toBe(obBefore);
    expect(await stageOf(U.id, leftJoin)).toBe(stageBefore);
    expect((await q1(`SELECT status, submit_key FROM attempts WHERE id = $1`, [a.attempt.id]))).toMatchObject({ status: "open", submit_key: null });
    // 安全重试：同一个键成功结算
    const ok = await submitAttemptSafe(U.id, a.attempt.id, GOOD_VARIANT, "key-fault-000001");
    expect(ok.evaluation.verdict).toBe("correct");
    expect(await stageOf(U.id, leftJoin)).toBe("bloom");
  });
});

describe("成长规则", () => {
  it("引导→生叶；独立答错→花苞但不退化；未做过的独立变式答对→开花；熟题重复答对不算新的迁移证据", async () => {
    const W = await makeUser("grow");
    expect(await stageOf(W.id, leftJoin)).toBe("seed");
    const g = await startAttempt(W.id, await taskVersion("每位学生的本学期选课数"), "guided");
    await takeHint(W.id, g.attempt.id);
    const rg = await submitAttemptSafe(W.id, g.attempt.id, GOOD_GUIDED, "key-grow-0000001");
    expect(rg.evidence[0].kind).toBe("guided_practice");
    expect(await stageOf(W.id, leftJoin)).toBe("leaf");
    const i1 = await startAttempt(W.id, await taskVersion("找出没有选课的学生"), "independent");
    const ri = await submitAttemptSafe(W.id, i1.attempt.id, "SELECT name FROM students", "key-grow-0000002");
    expect(ri.evaluation.verdict).toBe("incorrect");
    expect(await stageOf(W.id, leftJoin)).toBe("bud");
    const v1 = await startAttempt(W.id, await taskVersion("每门课程的高分人数（变式）"), "independent");
    const rv = await submitAttemptSafe(W.id, v1.attempt.id, GOOD_VARIANT, "key-grow-0000003");
    expect(rv.evidence[0].kind).toBe("independent_variant_pass");
    expect(await stageOf(W.id, leftJoin)).toBe("bloom");
    // 同一变式再做一次并答对：只是独立作答，不新增“变式通过”
    const v2 = await startAttempt(W.id, await taskVersion("每门课程的高分人数（变式）"), "independent");
    const rv2 = await submitAttemptSafe(W.id, v2.attempt.id, GOOD_VARIANT, "key-grow-0000004");
    expect(rv2.evidence[0].kind).toBe("independent_attempt");
    expect(rv2.evidence[0].detail).toContain("重复题目");
    expect(await count(`SELECT count(*)::int n FROM learning_evidence WHERE user_id = $1 AND concept_id = $2 AND kind = 'independent_variant_pass'`, [W.id, leftJoin])).toBe(1);
  });

  it("独立模式中使用了提示：改记为引导练习，不能开花", async () => {
    const W = await makeUser("hint");
    const v = await startAttempt(W.id, await taskVersion("每门课程的高分人数（变式）"), "independent");
    await takeHint(W.id, v.attempt.id);
    const r = await submitAttemptSafe(W.id, v.attempt.id, GOOD_VARIANT, "key-hint-0000001");
    expect(r.evidence[0].kind).toBe("guided_practice");
    expect(await stageOf(W.id, leftJoin)).toBe("leaf");
  });

  it("自述理解被记录但不推动阶段；撤销证据后重新计算并留下事件", async () => {
    const W = await makeUser("self");
    await selfReport(W, leftJoin, "我觉得我懂了");
    expect(await stageOf(W.id, leftJoin)).toBe("seed");
    const ev = await withTx((c) => addEvidence(c, { userId: W.id, conceptId: leftJoin, kind: "asked", detail: "测试提问" }));
    expect(await stageOf(W.id, leftJoin)).toBe("sprout");
    const rv = await withTx((c) => revokeEvidence(c, W.id, ev.evidenceId, "标错了知识点"));
    expect(rv?.toStage).toBe("seed");
    expect(await stageOf(W.id, leftJoin)).toBe("seed");
    const row = await q1(`SELECT revoked_at, revoke_reason FROM learning_evidence WHERE id = $1`, [ev.evidenceId]);
    expect(row.revoke_reason).toBe("标错了知识点");
    const types = (await q(`SELECT event_type FROM growth_events WHERE user_id = $1 AND concept_id = $2 ORDER BY created_at`, [W.id, leftJoin])).map((r) => r.event_type);
    expect(types).toEqual(expect.arrayContaining(["planted", "evidence_added", "stage_changed", "evidence_revoked"]));
  });

  it("computeStage 规则表", () => {
    expect(computeStage(new Set()).stage).toBe("seed");
    expect(computeStage(new Set(["self_report", "team_work"])).stage).toBe("seed");
    expect(computeStage(new Set(["note"])).stage).toBe("sprout");
    expect(computeStage(new Set(["guided_practice"])).stage).toBe("leaf");
    expect(computeStage(new Set(["independent_attempt"])).stage).toBe("bud");
    expect(computeStage(new Set(["independent_variant_pass"])).stage).toBe("bloom");
  });

  it("新用户先诊断；之后的选题理由来自真实记录；先修满足查询与待验证汇总可用", async () => {
    const W = await makeUser("diag");
    const d = await createPractice(W.id, {});
    expect(d.purpose).toBe("diagnostic");
    expect(d.picks.every((p) => p.suggestedMode === "diagnostic")).toBe(true);
    const p = await createPractice(U.id, { conceptId: leftJoin });
    expect(p.purpose).toBe("personalized");
    expect(p.picks.length).toBeGreaterThan(0);
    const ready = await readyTasks(W.id);
    expect(ready.every((r: any) => r.conceptName !== "左外连接")).toBe(true); // 左外连接的先修（内连接、NULL）尚未生叶
    expect(Array.isArray(await reviewSummary(U.id))).toBe(true);
  });
});

describe("SQL 练习受限沙箱", () => {
  it("只允许单条 SELECT；拒绝多语句与写操作", () => {
    expect(() => checkSql("DELETE FROM students")).toThrow();
    expect(() => checkSql("SELECT 1; DROP TABLE students")).toThrow();
    expect(checkSql("SELECT 'a;b' AS x;")).toBe("SELECT 'a;b' AS x");
  });
  it("执行在只读事务中，写操作被数据库拒绝；只能看到练习数据集", async () => {
    await expect(runSandboxSql("school_v1", "WITH x AS (DELETE FROM students RETURNING *) SELECT * FROM x")).rejects.toMatchObject({ code: "sql_error" });
    const r = await runSandboxSql("school_v1", "SELECT count(*) FROM students");
    expect(Number(r.rows[0][0])).toBe(6);
    await expect(runSandboxSql("school_v1", "SELECT * FROM users")).rejects.toMatchObject({ code: "sql_error" });
  });
  it("沙箱角色无法连接业务数据库", async () => {
    const url = new URL(process.env.SANDBOX_DATABASE_URL!);
    url.pathname = "/" + new URL(process.env.DATABASE_URL!).pathname.slice(1);
    const c = new Client({ connectionString: url.toString() });
    await expect(c.connect()).rejects.toThrow(/permission denied|CONNECT/i);
    await c.end().catch(() => {});
  });
  it("长查询超时", async () => {
    await expect(runSandboxSql("school_v1", "SELECT count(*) FROM generate_series(1, 300000000)")).rejects.toMatchObject({ message: expect.stringContaining("超时") });
  }, 15000);
});
