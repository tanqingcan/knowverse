"use client";
/**
 * V4-H15 隔离验证：静态绘本是否逐件渲染「用户新增装饰」。
 * 不依赖数据库，用固定的演示装饰（3 件用户装饰 + 2 栋建筑）验证 `.sg-udecor` 是否按实际坐标出现。
 */
import { StaticGarden } from "@/components/world/StaticGarden";
import type { WorldPlant } from "@/components/world/bedLayout";

const PLANTS = [
  { id: "p1", conceptName: "左外连接", species: "rose", color: "rose", stage: "bloom", isNatal: true, gardenIndex: 0, x: 0.1, z: 0.1 },
  { id: "p2", conceptName: "内连接", species: "iris", color: "mist", stage: "bloom", isNatal: false, gardenIndex: 0, x: -0.1, z: 0.05 },
] as unknown as WorldPlant[];

// 用户装饰：3 件（玫瑰/围栏/泥土），坐标刻意错开
const DECOR = [
  { kind: "cottage", x: 0.92, z: -0.92, rot: -28 },
  { kind: "greenhouse", x: -0.98, z: -0.86, rot: 26 },
  { kind: "rose", x: 1.4, z: 0.6, rot: 0 },
  { kind: "fence", x: -1.5, z: 0.9, rot: 0 },
  { kind: "soil", x: 0.2, z: 1.6, rot: 0 },
];

export default function Page() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#2A2338", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 900, height: 700 }}>
        <StaticGarden
          plants={PLANTS}
          gardens={[{ name: "默认花圃" }]}
          decor={DECOR}
          pose="idle"
          signText="测试星球"
        />
      </div>
    </div>
  );
}
