"use client";
/**
 * 参观模式（只读）：展示一位同学的星球与装饰，不能编辑。
 * 通过 /visit?user=<userId> 拉取真实数据（GET /api/planets/[userId]），
 * 只显示对方 share_planet / share_stages 打开的内容；WebGL 失败时降级为 2D 绘本（StaticGarden）。
 * 创造模式布局：展示对方「已发布」的布局（只读），未发布不展示。
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sky } from "@/components/ui/Sky";
import type { WorldPlant } from "@/components/world/layout";

const GardenWorld = dynamic(() => import("@/components/world/GardenWorld").then((m) => m.GardenWorld), { ssr: false, loading: () => null });
const StaticGarden = dynamic(() => import("@/components/world/StaticGarden").then((m) => m.StaticGarden), { ssr: false, loading: () => null });

type VisitPlanet = {
  userId: string;
  displayName: string;
  planetName: string | null;
  natalPlant: { id: string; conceptName: string | null; species: string; color: string; nickname: string | null } | null;
  gardens: { id: string; name: string; subjectId: string; subjectName: string; sortOrder: number }[];
  plants: { id: string; gardenId: string; conceptId: string; conceptName: string; species: string; color: string; nickname: string | null; stage: string; isNatal: boolean }[];
  decor: { kind: string; x: number; z: number; rot: number; scale: number; width: number | null; length: number | null; color: string | null; stage: string | null; parts?: Record<string, string> | null }[];
};

export default function VisitPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<VisitPlanet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("user");
    setUserId(u);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setError(null);
    setData(null);
    api<VisitPlanet>(`/api/planets/${userId}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e: any) => { if (alive) setError(e?.message ?? "加载失败"); });
    return () => { alive = false; };
  }, [userId]);

  const scenePlants: WorldPlant[] = (data?.plants ?? []).map((p) => ({
    id: p.id,
    conceptName: p.conceptName,
    species: p.species,
    color: p.color,
    stage: p.stage as WorldPlant["stage"],
    isNatal: p.isNatal,
    nickname: p.nickname,
    gardenIndex: data?.gardens.findIndex((g) => g.id === p.gardenId) ?? 0,
  }));
  const gardens = (data?.gardens ?? []).map((g) => ({ name: g.name }));
  const planetName = data?.planetName ?? (data ? `${data.displayName}的星球` : "");
  const displayName = data?.displayName ?? "";
  // 参观只读：对方已发布的创造模式布局
  const visitDecor = (data?.decor ?? []).map((d, i) => ({
    id: `visit-${i}`, kind: d.kind, x: d.x, z: d.z, rot: d.rot, scale: d.scale,
    width: d.width ?? undefined, length: d.length ?? undefined, color: d.color ?? undefined, stage: d.stage ?? undefined,
    parts: d.parts ?? undefined,
  }));

  return (
    <div className="app is-garden">
      <Sky />
      <section className="world-wrap" aria-label={data ? `参观 ${displayName} 的星球（只读）` : "参观星球（只读）"}>
        {!userId ? (
          <div className="empty" role="status">缺少要参观的用户：请使用 <code>/visit?user=&lt;userId&gt;</code> 访问。</div>
        ) : error ? (
          <div className="empty" role="alert">{error}</div>
        ) : !data ? (
          <div className="empty" role="status">加载中…</div>
        ) : !failed ? (
          <GardenWorld
            plants={scenePlants}
            gardens={gardens}
            mode="garden"
            reduced={false}
            pose="idle"
            lampState="idle"
            signText={planetName}
            signSub="同学 · 只读"
            recenterKey={0}
            intro="none"
            readOnly
            decor={visitDecor as any}
            onFail={() => setFailed(true)}
          />
        ) : (
          <StaticGarden plants={scenePlants} gardens={gardens} celebrate={null} reduced={false} compact={false} pose="idle" signText={planetName} decor={visitDecor} />
        )}
      </section>
      <header className="topnav">
        <div className="brand" aria-label="知屿 KNOWVERSE">知屿<small>KNOWVERSE</small></div>
        <div className="nav-right">
          <Link className="btn btn-soft btn-sm" href="/space">回到我的星球</Link>
        </div>
      </header>
      {data && <div className="visit-note" role="status">你在参观「{displayName}」的星球 · 只读，不能编辑</div>}
    </div>
  );
}
