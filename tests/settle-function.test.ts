/**
 * fn_settle_attempt 的数据库层保证（A3）
 *
 * 绕过应用直接调用函数，验证：
 *   - 并发调用同一作答：只有一次真正结算，其余返回 replay；
 *   - 幂等键被其他作答占用 → 23505（唯一索引兜底）；
 *   - 不存在的作答 → P0002，且没有写入副作用。
 */
import { describe, expect, it } from "vitest";
import { q, q1 } from "@/db";
import { startAttempt } from "@/server/practice";
import { concept, makeUser, taskVersion } from "./helpers";

const CALL = `SELECT fn_settle_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS doc`;

function args(userId: string, attemptId: string, submitKey: string, conceptId: string) {
  return [
    userId, attemptId, "SELECT 1", submitKey, "rule", "correct", 1,
    "测试结算", null, null, null,
    JSON.stringify([{ conceptId, kind: "guided_practice", detail: "直接调用函数结算", usedHints: false, aiAssisted: false }]),
    false,
  ];
}

describe("fn_settle_attempt（数据库侧幂等与回滚）", () => {
  it("并发 5 次调用同一作答，只产生一条评价，其余返回 replay", async () => {
    const u = await makeUser("sa");
    const c = await concept("左外连接");
    const tv = await taskVersion("每位学生的本学期选课数");
    const a = await startAttempt(u.id, tv, "guided");

    const results = await Promise.all(
      Array.from({ length: 5 }, () => q<{ doc: any }>(CALL, args(u.id, a.attempt.id, "key-db-concurrent-1", c)).then((r) => r[0].doc)),
    );
    const fresh = results.filter((d) => d.replay === false);
    const replay = results.filter((d) => d.replay === true);
    expect(fresh).toHaveLength(1);
    expect(replay).toHaveLength(4);

    const evals = await q1<{ n: number }>("SELECT count(*)::int n FROM evaluations WHERE attempt_id = $1", [a.attempt.id]);
    const evidence = await q1<{ n: number }>("SELECT count(*)::int n FROM learning_evidence WHERE attempt_id = $1", [a.attempt.id]);
    expect(evals!.n).toBe(1);
    expect(evidence!.n).toBe(1);
  });

  it("幂等键已被其他作答占用时抛 23505，且不留下评价", async () => {
    const u = await makeUser("sb");
    const c = await concept("左外连接");
    const tv = await taskVersion("每位学生的本学期选课数");
    const first = await startAttempt(u.id, tv, "guided");
    const second = await startAttempt(u.id, tv, "guided");

    await q(CALL, args(u.id, first.attempt.id, "key-db-dup-0001", c));
    await expect(q(CALL, args(u.id, second.attempt.id, "key-db-dup-0001", c))).rejects.toMatchObject({ code: "23505" });

    const left = await q1<{ n: number }>("SELECT count(*)::int n FROM evaluations WHERE attempt_id = $1", [second.attempt.id]);
    expect(left!.n).toBe(0);
  });

  it("不存在的作答报 P0002，不写入任何行", async () => {
    const u = await makeUser("sc");
    const c = await concept("左外连接");
    const before = await q1<{ n: number }>("SELECT count(*)::int n FROM evaluations");
    await expect(
      q(CALL, args(u.id, "00000000-0000-0000-0000-000000000000", "key-db-missing-1", c)),
    ).rejects.toMatchObject({ code: "P0002" });
    const after = await q1<{ n: number }>("SELECT count(*)::int n FROM evaluations");
    expect(after!.n).toBe(before!.n);
  });
});
