import { describe, expect, it } from "vitest";
import { capFrame } from "@/components/world/layout";
import { PLANET_R } from "@/components/world/geo";

/**
 * G3 自动检查：球面贴地 surface 的每个网格顶点都必须落在球面（半径 PLANET_R + lift）上，
 * 数值有限，不能出现 NaN/Infinity、悬空或穿入。旋转/扩大/移动都不改变这个约束。
 */
describe("SphereSurface 顶点贴球面（G3）", () => {
  const lift = 0.02;
  const expectedR = PLANET_R + lift;

  it("所有顶点半径 = PLANET_R + lift，且坐标有限", () => {
    const segW = 14, segL = 14;
    let checked = 0;
    for (const cx of [-1.5, -0.3, 0, 1.2]) {
      for (const cz of [-1.0, 0, 1.4]) {
        for (const width of [0.7, 1.4, 2.4]) {
          for (const length of [0.7, 1.4, 2.4]) {
            for (const rot of [0, 30, 45, 90, 180]) {
              const a = (rot * Math.PI) / 180;
              const cos = Math.cos(a), sin = Math.sin(a);
              for (let j = 0; j <= segL; j++) {
                for (let i = 0; i <= segW; i++) {
                  const u = (i / segW - 0.5) * width;
                  const v = (j / segL - 0.5) * length;
                  const dx = u * cos - v * sin;
                  const dz = u * sin + v * cos;
                  const f = capFrame(cx + dx, cz + dz, 0, lift);
                  const r = Math.hypot(f.pos.x, f.pos.y, f.pos.z);
                  expect(Number.isFinite(r)).toBe(true);
                  expect(Math.abs(r - expectedR)).toBeLessThan(2e-3);
                  checked++;
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it("扩大面积时边缘顶点仍贴球面（不悬空/不入球）", () => {
    // 同一中心，2.4×2.4 的最大面积：四角必须仍在球面上
    const half = 1.2;
    for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      const f = capFrame(0.4 + dx, 0.3 + dz, 0, lift);
      const r = Math.hypot(f.pos.x, f.pos.y, f.pos.z);
      expect(Math.abs(r - expectedR)).toBeLessThan(2e-3);
    }
  });
});
