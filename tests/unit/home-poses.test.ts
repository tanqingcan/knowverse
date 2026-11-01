import { describe, expect, it } from "vitest";
import { homePoses, doorOf } from "@/lib/home/home-layout";
import { SPOTS } from "@/components/world/layout";

/** H09/H15：场景锚点从布局实例推导——3D 与 2D 静态绘本共用同一份推导，建筑移动后门口/星灯停靠跟随 */
describe("homePoses / doorOf", () => {
  it("无实例时回落到 SPOTS 默认位", () => {
    const p = homePoses([]);
    expect(p.cottage.x).toBeCloseTo(SPOTS.cottage.x, 6);
    expect(p.cottage.z).toBeCloseTo(SPOTS.cottage.z, 6);
    expect(p.greenhouse.x).toBeCloseTo(SPOTS.greenhouse.x, 6);
    expect(p.lampSpot.x).toBeCloseTo(SPOTS.lampSpot.x, 6);
  });

  it("实例移动后锚点跟随（3D 与 2D 绘本同源）", () => {
    const moved = homePoses([{ kind: "cottage", x: 2, z: -1, rot: 0 }]);
    expect(moved.cottage.x).toBe(2);
    expect(moved.cottage.z).toBe(-1);
    // 未移动的仍保持默认
    expect(moved.greenhouse.x).toBeCloseTo(SPOTS.greenhouse.x, 6);
  });

  it("星灯停靠点随书房平移", () => {
    const base = homePoses([]);
    const moved = homePoses([{ kind: "cottage", x: SPOTS.cottage.x + 0.5, z: SPOTS.cottage.z, rot: SPOTS.cottage.yaw }]);
    expect(moved.lampSpot.x - base.lampSpot.x).toBeCloseTo(0.5, 6);
    expect(moved.lampSpot.z - base.lampSpot.z).toBeCloseTo(0, 6);
  });

  it("门口偏移随 yaw 旋转（doorOf）", () => {
    const def = { x: SPOTS.cottage.x, z: SPOTS.cottage.z, yaw: SPOTS.cottage.yaw };
    const same = doorOf(def, def, SPOTS.cottageDoor);
    expect(same.x).toBeCloseTo(SPOTS.cottageDoor.x, 6);
    expect(same.z).toBeCloseTo(SPOTS.cottageDoor.z, 6);
    // 旋转 180° 后门口应落到建筑另一侧
    const flipped = doorOf({ ...def, yaw: def.yaw + 180 }, def, SPOTS.cottageDoor);
    const dx0 = SPOTS.cottageDoor.x - def.x, dz0 = SPOTS.cottageDoor.z - def.z;
    expect(flipped.x - def.x).toBeCloseTo(-dx0, 4);
    expect(flipped.z - def.z).toBeCloseTo(-dz0, 4);
  });
});
