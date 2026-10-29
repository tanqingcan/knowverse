"use client";
/**
 * 参观模式（只读原型）：展示一位同学的星球与装饰，不能编辑。
 * 现在是本地 mock；等 A 的 `/api/planets/[id]/decor` 就绪后换成真实数据。
 */
import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Sky } from "@/components/ui/Sky";
import type { WorldPlant } from "@/components/world/layout";
import type { DecorPlacement } from "@/lib/decor";

const GardenWorld = dynamic(() => import("@/components/world/GardenWorld").then((m) => m.GardenWorld), { ssr: false, loading: () => null });
const StaticGarden = dynamic(() => import("@/components/world/StaticGarden").then((m) => m.StaticGarden), { ssr: false, loading: () => null });

const PLANTS: WorldPlant[] = [
  { id: "v1", conceptName: "左外连接", species: "rose", color: "rose", stage: "bloom", isNatal: true, gardenIndex: 0 },
  { id: "v2", conceptName: "内连接", species: "iris", color: "mist", stage: "bud", gardenIndex: 0 },
  { id: "v3", conceptName: "分组聚合", species: "lily", color: "cream", stage: "leaf", gardenIndex: 1 },
  { id: "v4", conceptName: "条件概率", species: "sunflower", color: "coral", stage: "bloom", gardenIndex: 1 },
];

const DECOR: DecorPlacement[] = [
  { id: "vd1", kind: "tree", x: 1.45, z: 0.5, rot: 0, scale: 1 },
  { id: "vd2", kind: "chair", x: -1.35, z: 0.55, rot: 30, scale: 1 },
  { id: "vd3", kind: "flower3", x: -1.0, z: 1.1, rot: 0, scale: 1, color: "#ff5fa2" },
  { id: "vd4", kind: "flower2", x: -1.22, z: 0.92, rot: 0, scale: 1, color: "#ffd15f" },
  { id: "vd5", kind: "lamp", x: 1.0, z: 1.0, rot: 0, scale: 1 },
];

export default function VisitPage() {
  const [failed, setFailed] = React.useState(false);
  return (
    <div className="app is-garden">
      <Sky />
      <section className="world-wrap" aria-label="参观 星野 的星球（只读）">
        {!failed ? (
          <GardenWorld
            plants={PLANTS}
            gardens={[{ name: "星野的花圃" }]}
            mode="garden"
            reduced={false}
            pose="idle"
            lampState="idle"
            signText="星野的星球"
            signSub="同学 · 只读"
            recenterKey={0}
            intro="none"
            decor={DECOR}
            readOnly
            onFail={() => setFailed(true)}
          />
        ) : (
          <StaticGarden plants={PLANTS} gardens={[{ name: "星野的花圃" }]} celebrate={null} reduced={false} compact={false} pose="idle" signText="星野的星球" />
        )}
      </section>
      <header className="topnav">
        <div className="brand" aria-label="知屿 KNOWVERSE">知屿<small>KNOWVERSE</small></div>
        <div className="nav-right">
          <Link className="btn btn-soft btn-sm" href="/space">回到我的星球</Link>
        </div>
      </header>
      <div className="visit-note" role="status">你在参观「星野」的星球 · 只读，不能编辑</div>
    </div>
  );
}
