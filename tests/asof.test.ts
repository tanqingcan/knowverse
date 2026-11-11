/**
 * 时间机器（as-of 重放）
 *
 * 不建快照表，而是按证据的有效期在 SQL 里重放：
 *   证据在 t 有效 ⇔ created_at ≤ t 且（未撤销 或 revoked_at > t）
 * 验证：逐段阶段、撤销后的历史可回看、与 learning_states 一致、跨用户被拒绝。
 */
import { describe, expect, it } from "vitest";
import { q, q1, withTx } from "@/db";
import { gardenAsOf } from "@/server/world";
import { concept, makeUser } from "./helpers";

const DAY = 86_400_000;
const BASE = new Date("2026-01-01T00:00:00Z").getTime();
const at = (days: number) => new Date(BASE + days * DAY);

describe("时间机器：按证据有效期重放", () => {
  it("四个阶段的时间点都能重放正确", async () => {
    const u = await makeUser("tm");
    const cid = await concept("左外连接");
    const ins = (kind: string, days: number) =>
      q(`INSERT INTO learning_evidence (user_id, concept_id, kind, detail, created_at)
         VALUES ($1,$2,$3,'时间机器测试',$4)`, [u.id, cid, kind, at(days)]);

    await ins("note", 1);                    // 第 1 天：嫩芽
    await ins("guided_practice", 3);         // 第 3 天：生叶
    await ins("independent_attempt", 6);     // 第 6 天：花苞
    await ins("independent_variant_pass", 9);// 第 9 天：开花

    const stageAt = async (days: number) =>
      (await q1<{ s: string }>(`SELECT fn_stage_at($1, $2, $3) AS s`, [u.id, cid, at(days)]))!.s;

    expect(await stageAt(0)).toBe("seed");
    expect(await stageAt(2)).toBe("sprout");
    expect(await stageAt(4)).toBe("leaf");
    expect(await stageAt(7)).toBe("bud");
    expect(await stageAt(10)).toBe("bloom");
  });

  it("撤销证据只影响撤销之后的时刻，之前的历史仍可回看", async () => {
    const u = await makeUser("tn");
    const cid = await concept("内连接");
    await q(`INSERT INTO learning_evidence (user_id, concept_id, kind, detail, created_at)
             VALUES ($1,$2,'note','笔记（保留）',$3)`, [u.id, cid, at(1)]);
    await q(`INSERT INTO learning_evidence (user_id, concept_id, kind, detail, created_at)
             VALUES ($1,$2,'guided_practice','引导练习（第 5 天被撤销）',$3)`, [u.id, cid, at(3)]);
    await q(`UPDATE learning_evidence SET revoked_at = $3, revoke_reason = '测试撤销'
             WHERE user_id = $1 AND concept_id = $2 AND kind = 'guided_practice'`, [u.id, cid, at(5)]);

    const stageAt = async (days: number) =>
      (await q1<{ s: string }>(`SELECT fn_stage_at($1, $2, $3) AS s`, [u.id, cid, at(days)]))!.s;

    expect(await stageAt(2)).toBe("sprout");  // 只有笔记
    expect(await stageAt(4)).toBe("leaf");    // 引导练习有效
    expect(await stageAt(6)).toBe("sprout");  // 撤销后回落到嫩芽
    expect(await stageAt(4)).toBe("leaf");    // 回看历史不受撤销影响
  });

  it("花园快照：每株花的当时阶段与当前阶段、变化数量", async () => {
    const u = await makeUser("to");
    const snap = await gardenAsOf(u, new Date());
    expect(snap.plants.length).toBeGreaterThan(0);
    expect(snap.plants[0]).toMatchObject({
      plantId: expect.any(String), conceptName: expect.any(String), stageAt: expect.any(String), stageNow: expect.any(String),
    });
    expect(typeof snap.changedSince).toBe("number");
    expect(snap.countsAt).toEqual(expect.any(Object));
    // 刚开场、没有证据时，当时与现在都是 seed
    expect(snap.countsAt.seed).toBe(snap.plants.length);
  });

  it("as-of(现在) 与 learning_states 一致（种子数据全量核对）", async () => {
    // 只看种子账号：其他用例会直接插证据（不经过 addEvidence），不在核对范围内
    const drift = await q1<{ n: number }>(`
      SELECT count(*)::int AS n
        FROM learning_states ls JOIN users u ON u.id = ls.user_id
       WHERE u.is_demo AND ls.stage <> fn_stage_at(ls.user_id, ls.concept_id, now())`);
    expect(drift!.n).toBe(0);
  });

  it("数据库函数拒绝跨用户查询（42501）", async () => {
    const a = await makeUser("tp");
    const b = await makeUser("tq");
    await expect(
      withTx(async (c) => {
        await c.query("SELECT set_config('app.user_id', $1, true)", [a.id]);
        return c.query("SELECT fn_stage_at($1, $2, now())", [b.id, await concept("左外连接")]);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
