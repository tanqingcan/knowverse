/**
 * 增量维护的班级统计（A8）
 *
 * 验证：
 *   - 成员增删、分享开关、学习活跃都会增量更新 class_stats；
 *   - 增量结果与全量物化视图（mv_class_stats）一致；
 *   - 人为破坏后能被对账视图发现、被 fn_reconcile_class_stats 修复；
 *   - 并发加入不会漏计（原子自增）。
 */
import { describe, expect, it } from "vitest";
import { q, q1, withTx } from "@/db";
import { createClass, joinClass, setSharing } from "@/server/classes";
import { addEvidence } from "@/server/growth";
import { concept, makeUser } from "./helpers";

async function driftCount(classId: string) {
  return Number((await q1<{ n: number }>(`SELECT count(*)::int n FROM v_class_stats_drift WHERE class_id = $1`, [classId]))!.n);
}

describe("class_stats 增量维护", () => {
  it("加入成员 / 打开分享 / 学习活跃 → 增量值与真实聚合一致", async () => {
    const a = await makeUser("cs");
    const b = await makeUser("ct");
    const { classId, joinCode } = await createClass(a, "增量统计班");
    await joinClass(b, joinCode);

    let st = await q1<any>(`SELECT member_count, shared_planet_count, last_active_at FROM class_stats WHERE class_id = $1`, [classId]);
    expect(st.member_count).toBe(2);
    expect(st.shared_planet_count).toBe(0);

    await setSharing(b, classId, { sharePlanet: true, shareStages: true });
    st = await q1<any>(`SELECT member_count, shared_planet_count FROM class_stats WHERE class_id = $1`, [classId]);
    expect(st.shared_planet_count).toBe(1);

    const cid = await concept("左外连接");
    await withTx((c) => addEvidence(c, { userId: b.id, conceptId: cid, kind: "note", detail: "活跃测试" }));
    st = await q1<any>(`SELECT last_active_at FROM class_stats WHERE class_id = $1`, [classId]);
    expect(st.last_active_at).not.toBeNull();

    // 与全量物化视图对照
    await q("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_class_stats");
    const full = await q1<any>(`SELECT member_count, shared_planet_count FROM mv_class_stats WHERE class_id = $1`, [classId]);
    const inc = await q1<any>(`SELECT member_count, shared_planet_count FROM class_stats WHERE class_id = $1`, [classId]);
    expect(inc).toEqual(full);
    expect(await driftCount(classId)).toBe(0);
  });

  it("并发加入同一班级：计数不多不少", async () => {
    const teacher = await makeUser("cu");
    const users = await Promise.all([makeUser("cv"), makeUser("cw"), makeUser("cx")]);
    const { classId, joinCode } = await createClass(teacher, "并发统计班");
    await Promise.all(users.map((u) => joinClass(u, joinCode)));
    const st = await q1<any>(`SELECT member_count FROM class_stats WHERE class_id = $1`, [classId]);
    expect(st.member_count).toBe(4);
    expect(await driftCount(classId)).toBe(0);
  });

  it("人为破坏 → 对账视图发现 → 修复函数幂等修复", async () => {
    const a = await makeUser("cy");
    const { classId, joinCode } = await createClass(a, "对账班");
    await joinClass(await makeUser("cz"), joinCode);

    await q(`UPDATE class_stats SET member_count = 99, shared_planet_count = 99 WHERE class_id = $1`, [classId]);
    expect(await driftCount(classId)).toBe(1);

    const fixed = await q1<{ n: number }>(`SELECT fn_reconcile_class_stats() AS n`);
    expect(Number(fixed!.n)).toBeGreaterThanOrEqual(1);
    expect(await driftCount(classId)).toBe(0);
    const st = await q1<any>(`SELECT member_count, shared_planet_count FROM class_stats WHERE class_id = $1`, [classId]);
    expect(st.member_count).toBe(2);
    expect(st.shared_planet_count).toBe(0);

    // 幂等：再修一次，修 0 行
    const again = await q1<{ n: number }>(`SELECT fn_reconcile_class_stats() AS n`);
    expect(Number(again!.n)).toBe(0);
  });
});
