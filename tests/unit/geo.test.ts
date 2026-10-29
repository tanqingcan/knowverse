/**
 * 草丛几何（B1「草丛圆润」）的回归测试：叶片分段、草丛片数与包围盒。
 * 只依赖 three，不需要数据库 / 浏览器。
 */
import { describe, it, expect } from "vitest";
import { bladeGeo, grassTuftGeo } from "@/components/world/geo";

const TRIS_PER_BLADE = 8 * 2 + 8 + 8; // 8 段侧面 16 三角 + 上下端盖各 8

describe("草叶 bladeGeo", () => {
  it("默认 6 段径向细分，可指定弯度", () => {
    const g = bladeGeo(0.03).toNonIndexed();
    expect(g.attributes.position.count).toBe((6 * 2 + 6 + 6) * 3);
  });

  it("8 段径向细分：32 个三角（96 个顶点）", () => {
    const g = bladeGeo(0.03, 0.0075, 8, 0.55).toNonIndexed();
    expect(g.attributes.position.count).toBe(TRIS_PER_BLADE * 3);
  });

  it("顶端外弯让顶部顶点偏离中心轴", () => {
    const g = bladeGeo(0.04, 0.0075, 8, 0.6);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    // 未弯曲时 x/z 应在 ±r 内，弯曲后 x 明显超出
    expect(bb.max.x).toBeGreaterThan(0.01);
    expect(bb.min.y).toBeCloseTo(0, 6);
    expect(bb.max.y).toBeCloseTo(0.04, 6);
  });
});

describe("草丛 grassTuftGeo", () => {
  it("由 8 片草叶合并而成（8 × 32 三角）", () => {
    const g = grassTuftGeo();
    expect(g.attributes.position.count).toBe(8 * TRIS_PER_BLADE * 3);
  });

  it("包围盒贴合地面且高度在合理范围（0.03–0.06）", () => {
    const g = grassTuftGeo();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    // 叶片基部有轻微左右倾斜，允许 1–2mm 埋进地面
    expect(bb.min.y).toBeGreaterThan(-0.002);
    expect(bb.min.y).toBeLessThan(0.001);
    expect(bb.max.y).toBeGreaterThan(0.03);
    expect(bb.max.y).toBeLessThan(0.06);
    // 径向铺开：外径应大于单片叶的 6mm 偏移
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0.012);
    expect(bb.max.z - bb.min.z).toBeGreaterThan(0.012);
  });

  it("参数变化时返回不同几何（缓存按参数区分）", () => {
    expect(grassTuftGeo(8, 8, 0.55)).not.toBe(grassTuftGeo(5, 6, 0.42));
  });
});
