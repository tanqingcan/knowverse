import { describe, expect, it } from "vitest";
import { SCENE_ASSETS, PLACEABLE_ASSETS, EDITABLE_ASSETS, catalogStats, assetById, DECOR_CATEGORY } from "@/lib/home/catalog";
import { SPOTS } from "@/components/world/layout";
import { DECOR_CATALOG, type DecorKind } from "@/lib/decor";

/** H01：全场景素材目录的自动核对（数量/唯一性/必备实例/可放置覆盖装饰目录/环境分离） */
describe("H01 全场景素材目录", () => {
  it("assetId 全局唯一", () => {
    const ids = SCENE_ASSETS.map((a) => a.assetId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("现有固定建筑全部登记且可编辑（H02 无双轨）", () => {
    const required = [
      ["bld.cottage", SPOTS.cottage],
      ["bld.greenhouse", SPOTS.greenhouse],
      ["bld.observatory", SPOTS.observatory],
      ["bld.seedShed", SPOTS.seedShed],
      ["bld.arch", SPOTS.arch],
      ["water.pond", SPOTS.pond],
      ["furn.bench", SPOTS.bench],
      ["light.lamp", SPOTS.lamp],
      ["sign.board", SPOTS.sign],
    ] as const;
    for (const [id, spot] of required) {
      const a = assetById(id);
      expect(a, `缺少 ${id}`).toBeTruthy();
      expect(a!.editable, `${id} 必须可编辑`).toBe(true);
      expect(Math.abs((a!.initial?.x ?? 1e9) - spot.x)).toBeLessThan(1e-6);
      expect(Math.abs((a!.initial?.z ?? 1e9) - spot.z)).toBeLessThan(1e-6);
    }
  });

  it("可放置素材覆盖 DECOR_CATALOG（H04 起群组不可放置，故减去 2）", () => {
    const groups = DECOR_CATALOG.filter((d) => d.kind === "grassGroup" || d.kind === "wildflowerGroup");
    for (const d of DECOR_CATALOG) {
      const a = assetById(`decor.${d.kind}`);
      expect(a, `缺少 decor.${d.kind}`).toBeTruthy();
      if (groups.some((g) => g.kind === d.kind)) expect(a!.placeable).toBeFalsy();
      else expect(a!.placeable).toBe(true);
    }
    expect(PLACEABLE_ASSETS.length).toBe(DECOR_CATALOG.length - groups.length);
  });

  it("环境类与地表编辑分离：环境不可编辑且不进入可编辑清单", () => {
    const env = SCENE_ASSETS.filter((a) => a.category === "environment");
    expect(env.length).toBeGreaterThanOrEqual(4);
    for (const a of env) {
      expect(a.editable).toBe(false);
      expect(EDITABLE_ASSETS.find((e) => e.assetId === a.assetId)).toBeUndefined();
    }
  });

  it("第二遍：类别映射穷尽 + 群组显式标记", () => {
    for (const k of Object.keys(DECOR_CATEGORY) as DecorKind[]) {
      expect(assetById(`decor.${k}`)!.category).toBe(DECOR_CATEGORY[k]);
    }
    expect(assetById("flora.grassGroup")!.group).toBe(true);
    expect(assetById("flora.wildflowerGroup")!.group).toBe(true);
    expect(assetById("bld.cottage")!.group).toBeUndefined();
  });

  it("目录统计合理（地表实例 + 可放置 + 环境）", () => {
    const s = catalogStats();
    expect(s.total).toBe(SCENE_ASSETS.length);
    // H02 起目录增加 7 种建筑；H04 起增加 2 种群组（不可放置）
    const groupKinds = DECOR_CATALOG.filter((d) => d.kind === "grassGroup" || d.kind === "wildflowerGroup").length;
    expect(s.placeable).toBe(DECOR_CATALOG.length - groupKinds);
    expect(s.placeable).toBeGreaterThanOrEqual(21);
    expect(s.editable).toBeGreaterThanOrEqual(20);
    expect(s.byCat.building).toBeGreaterThanOrEqual(5);
    expect(s.byCat.environment).toBe(4);
  });
});
