/**
 * 班级星系视图与函数（A2）
 *
 * 验证三件事：
 *   1. 跨用户读只走 fn_class_galaxy：非成员被数据库拒绝（42501）；
 *   2. 分享规则在库里执行：只返回本人 + 明确分享星球的成员，未分享者不出现；
 *   3. 物化视图 mv_class_stats 可 CONCURRENTLY 刷新。
 */
import { describe, expect, it } from "vitest";
import { q, q1 } from "@/db";
import { createClass, galaxy, joinClass, setSharing } from "@/server/classes";
import { makeUser } from "./helpers";

describe("班级星系（视图 + SECURITY DEFINER 函数）", () => {
  it("只返回本人与明确分享星球的成员，并给出隐藏人数", async () => {
    const a = await makeUser("ga");
    const b = await makeUser("gb");
    const c = await makeUser("gc");
    const { classId, joinCode } = await createClass(a, "测试星系");
    await joinClass(b, joinCode);
    await joinClass(c, joinCode);
    await setSharing(b, classId, { sharePlanet: true, shareStages: true });

    const asA = await galaxy(a, classId);
    expect(asA.planets.map((p) => p.userId).sort()).toEqual([a.id, b.id].sort());
    expect(asA.hiddenCount).toBe(1);
    expect(asA.memberCount).toBe(3);

    const bPlanet = asA.planets.find((p) => p.userId === b.id)!;
    expect(bPlanet.isMe).toBe(false);
    expect(bPlanet.plantCount).toBeGreaterThan(0);
    expect(bPlanet.plants?.length).toBeGreaterThan(0);
    expect(bPlanet.stageSummary).not.toBeNull();

    // 未分享的 C 仍能看到 B 主动分享的星球（这正是“分享”的含义），但看不到 A 的
    const asC = await galaxy(c, classId);
    expect(asC.planets.map((p) => p.userId).sort()).toEqual([b.id, c.id].sort());
    expect(asC.hiddenCount).toBe(1);

    // B 分享了自己的，但 A 没分享：B 也只看到自己
    const asB = await galaxy(b, classId);
    expect(asB.planets.map((p) => p.userId)).toEqual([b.id]);
  });

  it("非成员调用数据库函数被拒绝（SQLSTATE 42501）", async () => {
    const a = await makeUser("gx");
    const outsider = await makeUser("gy");
    const { classId } = await createClass(a, "封闭星系");
    await expect(q("SELECT fn_class_galaxy($1, $2)", [outsider.id, classId])).rejects.toMatchObject({ code: "42501" });
    // 成员可以调用
    const ok = await q1<{ ok: boolean }>("SELECT (fn_class_galaxy($1, $2) ->> 'memberCount')::int AS ok", [a.id, classId]);
    expect(ok!.ok).toBe(1);
  });

  it("物化视图可以 CONCURRENTLY 刷新", async () => {
    const a = await makeUser("gm");
    const b = await makeUser("gn");
    const { classId, joinCode } = await createClass(a, "统计星系");
    await joinClass(b, joinCode);
    await setSharing(b, classId, { sharePlanet: true });
    await q("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_class_stats");
    const row = await q1<{ member_count: number; shared_planet_count: number }>(
      "SELECT member_count, shared_planet_count FROM mv_class_stats WHERE class_id = $1", [classId]);
    expect(row!.member_count).toBe(2);
    expect(row!.shared_planet_count).toBe(1);
  });
});
