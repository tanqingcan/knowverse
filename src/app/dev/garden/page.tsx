"use client";
/** 花园场景预览（开发用）：?pose=tend&sel=1&celebrate=1 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const GardenWorld = dynamic(() => import("@/components/world/GardenWorld").then((m) => m.GardenWorld), { ssr: false });

const PLANTS = [
  { id: "p-natal-rose-0001", conceptName: "左外连接", species: "rose", color: "rose", stage: "bloom", isNatal: true, gardenIndex: 0 },
  { id: "p-iris-00000002", conceptName: "内连接", species: "iris", color: "mist", stage: "bloom", gardenIndex: 0 },
  { id: "p-lily-00000003", conceptName: "分组聚合", species: "lily", color: "cream", stage: "leaf", gardenIndex: 0 },
  { id: "p-sun-000000004", conceptName: "函数依赖", species: "sunflower", color: "gold", stage: "bloom", gardenIndex: 0 },
  { id: "p-sun-000000005", conceptName: "条件概率", species: "sunflower", color: "coral", stage: "sprout", gardenIndex: 1 },
  { id: "p-lily-00000006", conceptName: "全概率公式", species: "lily", color: "mist", stage: "bloom", gardenIndex: 1 },
  { id: "p-iris-00000007", conceptName: "贝叶斯公式", species: "iris", color: "sky", stage: "seed", gardenIndex: 1, reviewDue: true },
] as any[];

export default function Page() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [cel, setCel] = useState<any>(null);
  useEffect(() => { const s = new URLSearchParams(location.search); setQ(s); if (s.get("celebrate")) setTimeout(() => setCel({ plantId: PLANTS[0].id, fromStage: "leaf", toStage: "bud", key: 1 }), 800);
    const f = () => setCel({ plantId: PLANTS[0].id, fromStage: "bud", toStage: "bloom", key: Date.now() });
    window.addEventListener("kv-cel", f); return () => window.removeEventListener("kv-cel", f); }, []);
  if (!q) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg,#756B99 0%,#9CAFC5 42%,#F2C9B6 78%,#FFF7E8 100%)" }}>
      <GardenWorld plants={PLANTS} gardens={[{ name: "数据库系统概论" }, { name: "概率统计" }]} mode={(q.get("mode") as any) ?? "garden"}
        reduced={q.has("reduced")} pose={cel ? "celebrate" : (q.get("pose") as any) ?? "idle"} lampState="idle" signText="左外连接" signSub="本命花"
        selectedId={q.get("sel") ? PLANTS[+q.get("sel")!].id : null} recenterKey={0} intro="none" celebrate={cel}
        perf={q.has("perf")}
        hoverLabel={(k) => k} onFail={() => console.error("webgl fail")} />
    </div>
  );
}
