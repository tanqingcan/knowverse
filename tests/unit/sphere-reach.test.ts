import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { capFrame, capToAzPolar } from "@/components/world/layout";
import { PLANET_R } from "@/components/world/geo";

/**
 * H10：球面整周可达 / 贴地不浮空的数值验证。
 * 用「球面局部坐标」放置的对象，其位置必须恒在半径 PLANET_R 的球面上（不浮空/不陷地），
 * 且局部坐标系 Y 轴（上）必须朝球外——背面、接缝、极值处都要成立。
 */
describe("H10 球面放置几何", () => {
  const CASES: [number, number][] = [
    [0, 0], [0.001, 0.001],          // 极点附近
    [3, 0], [-3, 0], [0, 3], [0, -3], // 四个正向极值（赤道方向）
    [2.1, 2.1], [-2.1, -2.1],        // 对角线极值
    [4, 0], [0, 4], [-4, 0], [0, -4], // 超出舒适区、仍应贴球面
    [2.9, 0.4], [-0.4, 2.9], [1.5, -2.6],
  ];

  it("所有方位/极角处位置半径恒为 PLANET_R（不浮空也不陷地）", () => {
    for (const [x, z] of CASES) {
      const f = capFrame(x, z, 0);
      expect(f.pos.length()).toBeCloseTo(PLANET_R, 6);
    }
  });

  it("局部 Y 轴（上方向）朝球外，背面/极值也成立", () => {
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const [x, z] of CASES) {
      const f = capFrame(x, z, 0);
      const up = yAxis.clone().applyQuaternion(f.quat);
      const outward = f.pos.clone().normalize();
      expect(up.dot(outward)).toBeGreaterThan(0.99);
    }
  });

  it("yaw 只绕法线转，不破坏贴地（任意 yaw 半径不变、上方向不变）", () => {
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const yaw of [0, 45, 90, 137, -90]) {
      const f = capFrame(2.1, -1.3, yaw);
      expect(f.pos.length()).toBeCloseTo(PLANET_R, 6);
      const up = yAxis.clone().applyQuaternion(f.quat);
      expect(up.dot(f.pos.clone().normalize())).toBeGreaterThan(0.99);
    }
  });

  it("方位角整周连续：绕一圈 cap 坐标覆盖 0–360°", () => {
    const azs: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const { az } = capToAzPolar(Math.cos(a) * 2, Math.sin(a) * 2);
      azs.push(((az % 360) + 360) % 360);
    }
    const max = Math.max(...azs);
    const buckets = new Set(azs.map((v) => Math.floor(v / 30)));
    expect(buckets.size).toBeGreaterThanOrEqual(11); // 24 段覆盖到 12 个 30° 桶里的至少 11 个
    expect(max).toBeGreaterThan(180);
  });

  it("lift 只抬升半径，不改变朝向", () => {
    const a = capFrame(1.2, 0.7, 30, 0);
    const b = capFrame(1.2, 0.7, 30, 0.05);
    expect(b.pos.length()).toBeCloseTo(a.pos.length() + 0.05, 5);
    expect(b.quat.equals(a.quat)).toBe(true);
  });
});
