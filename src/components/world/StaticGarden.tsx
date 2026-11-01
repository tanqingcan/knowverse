"use client";
/**
 * 静态绘本场景（SVG）：WebGL 不可用、渲染失败或用户在设置中选择 2.5D 时使用。
 * 构图与 3D 花园一致（同一套布局）：主花圃居中、资料温室在左、星灯书屋在右、回忆小径、长椅与路灯、旅人。
 * 所有植物与场景入口都是可聚焦按钮（Tab / Enter / 空格）。
 */
import React, { useEffect, useMemo, useState } from "react";
import { FlowerBody, FlowerDefs, hashSeed } from "@/components/art/Flower";
import { STAGE_NAME } from "@/lib/flora";
import { layoutBeds, MEMORY_PATH, GREEN_PATH, SPOTS, TREES, type WorldPlant } from "./layout";
import { homePoses } from "@/lib/home/home-layout";
import type { Celebration, Hotspot } from "./GardenWorld";
import type { Pose } from "./Characters3D";

const W = 1440, H = 900;
const CX = 720, HORIZON = 300;
/** 球冠平面 → 画面：越靠前越低、越大 */
function P(x: number, z: number) {
  const depth = (z + 1.7) / 3.4;               // 0 = 远, 1 = 近
  const s = 0.62 + depth * 0.6;
  return { x: CX + x * 330 * s, y: HORIZON + 30 + depth * 520 - Math.pow(Math.abs(x) / 2.6, 2) * 120, s };
}

function Tree({ tint, s }: { tint: string; s: number }) {
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx={0} cy={2} rx={34} ry={7} fill="#3F3657" opacity={0.14} />
      <path d="M-5 0 Q -3 -40 -2 -62 L 4 -62 Q 5 -40 6 0Z" fill="#8C5F40" />
      <circle cx={0} cy={-84} r={32} fill={tint} /><circle cx={-24} cy={-70} r={22} fill="#F2C6CC" /><circle cx={24} cy={-72} r={22} fill={tint} />
      <circle cx={-6} cy={-104} r={18} fill="#F6D3D8" /><circle cx={-10} cy={-92} r={10} fill="#FFF7E8" opacity={0.35} />
    </g>
  );
}
function Bush({ s }: { s: number }) {
  return <g transform={`scale(${s})`}><ellipse cx={0} cy={2} rx={26} ry={6} fill="#3F3657" opacity={0.12} /><circle cx={-10} cy={-12} r={14} fill="#8DAF78" /><circle cx={10} cy={-14} r={16} fill="#A3C28B" /><circle cx={0} cy={-24} r={12} fill="#B3C98F" /><circle cx={4} cy={-28} r={3} fill="#F4D9DF" /></g>;
}
function Cottage({ lit }: { lit: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={6} rx={120} ry={20} fill="#3F3657" opacity={0.16} />
      <ellipse cx={0} cy={0} rx={92} ry={18} fill="#B9B2C9" />
      <path d="M-80 0 L -80 -118 Q 0 -134 80 -118 L 80 0 Q 0 16 -80 0Z" fill="#F6E8D6" />
      <path d="M40 -122 L 80 -118 L 80 0 Q 60 6 40 8Z" fill="#E6D2BC" />
      <path d="M-106 -112 L 0 -196 L 108 -110 Q 0 -96 -106 -112Z" fill="#C98478" />
      <path d="M-76 -172 L 0 -240 L 78 -170 Q 0 -160 -76 -172Z" fill="#A8665E" />
      <path d="M-46 -222 L 0 -278 L 46 -220 Q 0 -214 -46 -222Z" fill="#C98478" />
      <circle cx={0} cy={-284} r={8} fill="#DDB56D" />
      <rect x={34} y={-214} width={22} height={40} rx={6} fill="#B9A3A0" />
      <g transform="translate(22 -66)">
        <circle r={24} fill="#8C5F40" />
        <circle r={19} fill={lit ? "#FFD38A" : "#E3C9A0"} />
        {lit && <circle r={46} fill="#FFD38A" opacity={0.25} />}
        <path d="M-19 0 H 19 M0 -19 V 19" stroke="#8C5F40" strokeWidth={3} />
      </g>
      <path d="M-58 0 V -46 Q -38 -70 -18 -46 V 0Z" fill="#8C5F40" />
      <circle cx={-26} cy={-24} r={3} fill="#DDB56D" />
      <circle cx={-4} cy={-60} r={5} fill="#FFE0A6" /><circle cx={-4} cy={-60} r={14} fill="#FFE0A6" opacity={0.3} />
    </g>
  );
}
function Greenhouse() {
  return (
    <g>
      <ellipse cx={0} cy={8} rx={130} ry={22} fill="#3F3657" opacity={0.14} />
      <rect x={-120} y={-8} width={240} height={20} rx={8} fill="#B9B2C9" />
      <path d="M-104 -8 V -92 L 0 -150 L 104 -92 V -8Z" fill="#E6F0F5" opacity={0.42} />
      <path d="M-104 -8 V -92 L 0 -150 L 104 -92 V -8 M-104 -92 H 104 M0 -150 V -8 M-52 -121 V -8 M52 -121 V -8" stroke="#D4A87C" strokeWidth={5} fill="none" strokeLinejoin="round" />
      <rect x={-50} y={-50} width={100} height={7} rx={3} fill="#B5835C" />
      <rect x={-36} y={-72} width={30} height={10} rx={3} fill="#C56E6E" /><rect x={-34} y={-62} width={28} height={10} rx={3} fill="#6F8FB8" /><rect x={-30} y={-82} width={26} height={10} rx={3} fill="#D9B46A" />
      <circle cx={70} cy={-30} r={12} fill="#94B77C" /><circle cx={-76} cy={-28} r={12} fill="#E4A1AA" />
      <circle cx={30} cy={-96} r={8} fill="#FFE3A8" /><circle cx={30} cy={-96} r={26} fill="#FFE3A8" opacity={0.25} />
    </g>
  );
}
function Bench() {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={56} ry={9} fill="#3F3657" opacity={0.16} />
      <path d="M-40 0 V -18 M40 0 V -18" stroke="#3F3657" strokeWidth={5} strokeLinecap="round" />
      <rect x={-50} y={-24} width={100} height={8} rx={4} fill="#B5835C" />
      <rect x={-50} y={-50} width={100} height={8} rx={4} fill="#B5835C" /><rect x={-50} y={-38} width={100} height={7} rx={3.5} fill="#A9774F" />
    </g>
  );
}
function Lamp() {
  return (
    <g>
      <ellipse cx={0} cy={2} rx={14} ry={4} fill="#3F3657" opacity={0.16} />
      <path d="M0 0 V -120" stroke="#3F3657" strokeWidth={4} />
      <rect x={-10} y={-142} width={20} height={22} rx={4} fill="#FFE2A6" />
      <path d="M-13 -142 L 0 -152 L 13 -142Z" fill="#3F3657" />
      <circle cx={0} cy={-131} r={34} fill="#FFE2A6" opacity={0.22} />
    </g>
  );
}
function Traveler({ pose }: { pose: Pose }) {
  const sit = pose === "idle" || pose === "read" || pose === "think";
  return (
    <g transform={sit ? "translate(0 -22)" : ""}>
      {!sit && <ellipse cx={0} cy={2} rx={18} ry={4} fill="#3F3657" opacity={0.2} />}
      <path d={sit ? "M-8 -4 h 14 M-8 2 h 14" : "M-5 0 V -14 M5 0 V -14"} stroke="#5B4A63" strokeWidth={6} strokeLinecap="round" />
      <ellipse cx={0} cy={-26} rx={16} ry={19} fill="#8FA3C2" />
      <path d="M-9 -42 Q 0 -36 9 -42" stroke="#E4A1AA" strokeWidth={6} strokeLinecap="round" fill="none" />
      <circle cx={0} cy={-56} r={13} fill="#F4D7C3" />
      <path d="M-13.5 -56 Q -14 -72 0 -72 Q 14 -72 13.5 -56 Q 0 -63 -13.5 -56Z" fill="#DDB56D" />
      <circle cx={0} cy={-73} r={4} fill="#FFF7E8" />
      <circle cx={-4.5} cy={-54} r={1.5} fill="#3F3657" /><circle cx={4.5} cy={-54} r={1.5} fill="#3F3657" />
      {pose === "read" && <path d="M-12 -22 L 0 -18 L 12 -22 L 12 -12 L 0 -8 L -12 -12Z" fill="#FFF7E8" stroke="#A8665E" strokeWidth={1.5} />}
      {pose === "celebrate" && <path d="M-14 -36 L -22 -58 M14 -36 L 22 -58" stroke="#8FA3C2" strokeWidth={6} strokeLinecap="round" />}
    </g>
  );
}
function StarLampIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}><g className="sg-lamp">
      <circle r={30} fill="#FFE6A8" opacity={0.28} />
      <circle r={11} fill="#FFE6A8" /><circle r={15} fill="#FFF1D2" opacity={0.4} />
      <rect x={-6} y={-20} width={12} height={5} rx={2} fill="#8C5F40" />
      <path d="M0 16 L 3 22 L 0 28 L -3 22Z" fill="#FFF7E8" />
    </g></g>
  );
}

export function StaticGarden(props: {
  plants: WorldPlant[]; gardens: { name: string }[]; selectedId?: string | null; onSelect?: (id: string) => void; onHotspot?: (h: Hotspot) => void;
  celebrate?: Celebration; reduced?: boolean; compact?: boolean; pose: Pose; signText: string;
  /** H15：同份布局——2D 绘本的建筑位置也从布局实例推导，不回落到 SPOTS 固定位置 */
  decor?: { kind: string; x: number; z: number; rot: number }[] | null;
}) {
  const { plants, gardens, selectedId, onSelect, onHotspot } = props;
  const poses = useMemo(() => homePoses(props.decor ?? undefined), [props.decor]);
  const [glow, setGlow] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const beds = useMemo(() => layoutBeds(gardens, plants), [gardens, plants]);
  const byId = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  useEffect(() => {
    if (!props.celebrate) return;
    setGlow(props.celebrate.plantId);
    const t = setTimeout(() => setGlow(null), props.reduced ? 800 : 2600);
    return () => clearTimeout(t);
  }, [props.celebrate, props.reduced]);

  // 平滑曲线（Catmull-Rom → 三次贝塞尔）
  const pathD = (pts: [number, number][]) => {
    const q = pts.map(([x, z]) => P(x, z));
    let d = `M${q[0].x.toFixed(1)} ${q[0].y.toFixed(1)}`;
    for (let i = 0; i < q.length - 1; i++) {
      const p0 = q[Math.max(0, i - 1)], p1 = q[i], p2 = q[i + 1], p3 = q[Math.min(q.length - 1, i + 2)];
      d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };
  // H15：小路端点跟随当前建筑（同份布局）
  const memPts: [number, number][] = [[0.02, 0.05], ...MEMORY_PATH.slice(1), [(poses.cottage ?? SPOTS.cottage).x - 0.16, (poses.cottage ?? SPOTS.cottage).z + 0.04]];
  const greenPts: [number, number][] = [[-0.08, 0.05], ...GREEN_PATH.slice(1), [(poses.greenhouse ?? SPOTS.greenhouse).x + 0.05, (poses.greenhouse ?? SPOTS.greenhouse).z + 0.05]];

  // 前后排序：越远越先画
  type Item = { key: string; z: number; el: React.ReactNode };
  const items: Item[] = [];
  TREES.forEach((t, i) => { const p = P(t.x, t.z); items.push({ key: `t${i}`, z: t.z, el: <g transform={`translate(${p.x} ${p.y})`}>{t.kind === "tree" ? <Tree tint={(t as any).tint} s={p.s * 1.1} /> : <Bush s={p.s * 1.2} />}</g> }); });
  const hs = (name: Hotspot, label: string, child: React.ReactNode, x: number, z: number, scale = 1) => {
    const p = P(x, z);
    items.push({ key: name, z, el: (
      <g transform={`translate(${p.x} ${p.y}) scale(${p.s * scale})`} className="sg-hot" role="button" tabIndex={0} aria-label={label}
        onClick={() => onHotspot?.(name)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onHotspot?.(name); } }}
        onMouseEnter={() => setHover(name)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(name)} onBlur={() => setHover(null)}>
        {child}
      </g>
    ) });
  };
  hs("cottage", "星灯书屋：学习与对话", <Cottage lit />, (poses.cottage ?? SPOTS.cottage).x, (poses.cottage ?? SPOTS.cottage).z, 0.95);
  hs("greenhouse", "资料温室：我的资料", <Greenhouse />, (poses.greenhouse ?? SPOTS.greenhouse).x, (poses.greenhouse ?? SPOTS.greenhouse).z, 0.95);
  { const p = P((poses.lamp ?? SPOTS.lamp).x, (poses.lamp ?? SPOTS.lamp).z); items.push({ key: "lamp", z: (poses.lamp ?? SPOTS.lamp).z, el: <g transform={`translate(${p.x} ${p.y}) scale(${p.s})`}><Lamp /></g> }); }
  { const p = P((poses.bench ?? SPOTS.bench).x, (poses.bench ?? SPOTS.bench).z); items.push({ key: "bench", z: (poses.bench ?? SPOTS.bench).z, el: <g transform={`translate(${p.x} ${p.y}) scale(${p.s})`}><Bench />{(props.pose !== "tend" && props.pose !== "celebrate") && <g transform="translate(0 -8) scale(1.1)"><Traveler pose={props.pose} /></g>}</g> }); }
  if (props.signText) { const p = P((poses.sign ?? SPOTS.sign).x, (poses.sign ?? SPOTS.sign).z); items.push({ key: "sign", z: (poses.sign ?? SPOTS.sign).z, el: (
    <g transform={`translate(${p.x} ${p.y}) scale(${p.s})`}><path d="M0 0 V -40" stroke="#8C5F40" strokeWidth={5} /><rect x={-58} y={-82} width={116} height={46} rx={8} fill="#D4A87C" stroke="#8C5F40" strokeWidth={3} />
      <text x={0} y={-60} textAnchor="middle" fontSize={20} fontFamily="var(--font-title)" fill="#4A3426">{props.signText}</text><text x={0} y={-42} textAnchor="middle" fontSize={12} fill="#6B4C36">本命花</text></g>
  ) }); }

  // V4-H15：用户新增的装饰也画进绘本——按实际坐标画色点/几何近似图，
  // 明确"不支持的原样给近似"（不谎称还原了模型）。建筑/长椅/灯/牌已由 hs()/固定块画过，这里跳过。
  const DECOR_2D: Record<string, { r: number; fill: string }> = {
    rose: { r: 7, fill: "#D96A7A" }, flower: { r: 6, fill: "#E8A0B4" }, flower2: { r: 6, fill: "#C9A2E8" }, flower3: { r: 6, fill: "#F2C46B" },
    fence: { r: 6, fill: "#9A7B5A" }, soil: { r: 9, fill: "#8A6A4E" }, road: { r: 9, fill: "#B9A88F" },
    stone: { r: 6, fill: "#9AA0A6" }, rock: { r: 7, fill: "#8B9196" }, bush: { r: 7, fill: "#5F7F60" },
    tree: { r: 8, fill: "#4F7A52" }, pot: { r: 6, fill: "#B07A5A" },
  };
  for (const d of props.decor ?? []) {
    const g = DECOR_2D[d.kind];
    if (!g) continue;
    const c = P(d.x, d.z);
    items.push({
      key: `udecor-${d.kind}-${d.x.toFixed(3)}-${d.z.toFixed(3)}`,
      z: d.z,
      el: (
        <g transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) scale(${c.s.toFixed(3)})`} className="sg-udecor" data-kind={d.kind} aria-label={`用户装饰：${d.kind}（近似图）`}>
          <circle cx={0} cy={-g.r} r={g.r} fill={g.fill} opacity={0.9} />
          <ellipse cx={0} cy={0} rx={g.r * 1.2} ry={g.r * 0.4} fill="#000" opacity={0.12} />
        </g>
      ),
    });
  }

  for (const b of beds) {
    const c = P(b.x, b.z);
    const rx = b.r * 330 * c.s, ry = b.r * 150 * c.s;
    const plantEls = [...b.plants].sort((a, b2) => a.z - b2.z).map((pp) => {
      const p = byId.get(pp.id); if (!p) return null;
      const q = { x: c.x + pp.x * 330 * c.s, y: c.y + pp.z * 150 * c.s };
      const sel = selectedId === p.id;
      const k = (p.isNatal ? 1.65 : 1.3) * c.s * (b.main ? 1 : 0.85);
      const uid = `sg-${p.id.slice(0, 8)}`;
      const label = `${p.conceptName}${p.nickname ? `「${p.nickname}」` : ""} · ${STAGE_NAME[p.stage]}${p.reviewDue ? " · 待复习" : ""}${p.isNatal ? " · 本命花" : ""}`;
      return (
        <g key={p.id} transform={`translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) scale(${k.toFixed(3)})`} className={`sg-plant ${sel ? "is-selected" : ""} ${glow === p.id ? "is-growing" : ""}`}
          role="button" tabIndex={0} aria-label={label} aria-pressed={sel}
          onClick={() => onSelect?.(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(p.id); } }}
          onMouseEnter={() => setHover(`plant:${p.id}`)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(`plant:${p.id}`)} onBlur={() => setHover(null)}>
          <ellipse cx={0} cy={-50} rx={34} ry={60} fill="transparent" />
          <ellipse className="sg-ring" cx={0} cy={2} rx={30} ry={8} fill="none" stroke="#DDB56D" strokeWidth={3} />
          {glow === p.id && <circle cx={0} cy={-60} r={60} fill="#FFE6A8" opacity={0.35} className="sg-glow" />}
          <FlowerDefs uid={uid} color={p.color} />
          <FlowerBody uid={uid} species={p.species} stage={p.stage} seed={hashSeed(p.id)} />
          {p.reviewDue && <circle cx={22} cy={-36} r={5} fill="#F4DFA6" />}
        </g>
      );
    });
    items.push({ key: `bed${b.index}`, z: b.z, el: (
      <g>
        <ellipse cx={c.x} cy={c.y + 10} rx={rx + 26} ry={ry + 12} fill="#3F3657" opacity={0.1} />
        <ellipse cx={c.x} cy={c.y + 4} rx={rx + 10} ry={ry + 6} fill="#B5835C" />
        <ellipse cx={c.x} cy={c.y} rx={rx} ry={ry} fill="#9A7660" />
        <ellipse cx={c.x - rx * 0.2} cy={c.y - ry * 0.3} rx={rx * 0.6} ry={ry * 0.4} fill="#B08A6E" opacity={0.5} />
        {plantEls}
      </g>
    ) });
  }
  if (props.pose === "tend" || props.pose === "celebrate") {
    const target = beds.find((b) => b.plants.some((p) => p.id === (selectedId ?? props.celebrate?.plantId))) ?? beds[0];
    const p = P(target.x + target.r + 0.12, target.z + 0.1);
    items.push({ key: "trav", z: target.z + 0.1, el: <g transform={`translate(${p.x} ${p.y}) scale(${p.s * 1.1})`}><Traveler pose={props.pose} /></g> });
  }
  items.sort((a, b) => a.z - b.z);

  const hoverText = hover?.startsWith("plant:") ? (() => { const p = byId.get(hover.slice(6)); return p ? `${p.conceptName} · ${STAGE_NAME[p.stage]}` : null; })()
    : hover ? { cottage: "星灯书屋 · 学习与对话", greenhouse: "资料温室 · 我的资料", path: "回忆小径 · 历史问答", galaxy: "远处的星球 · 共学" }[hover] : null;
  const lampPos = (() => {
    const t = selectedId ? beds.find((b) => b.plants.some((p) => p.id === selectedId)) : null;
    // H15：星灯停靠点跟随书房（homePoses 已按实例推导）
    return t ? P(t.x + 0.2, t.z - 0.15) : P(poses.lampSpot.x, poses.lampSpot.z);
  })();

  return (
    <svg className={`static-garden ${props.compact ? "is-compact" : ""}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="group" aria-label="星球花园（静态绘本场景）">
      <defs>
        <radialGradient id="sg-ground" cx="50%" cy="12%" r="80%"><stop offset="0%" stopColor="#C6D5A6" /><stop offset="45%" stopColor="#A8BC91" /><stop offset="100%" stopColor="#7E9670" /></radialGradient>
        <radialGradient id="sg-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFE9C8" stopOpacity={0.9} /><stop offset="100%" stopColor="#F2C9B6" stopOpacity={0} /></radialGradient>
      </defs>
      <ellipse cx={CX} cy={HORIZON + 10} rx={700} ry={160} fill="url(#sg-sun)" opacity={0.6} />
      <g className="sg-hot" role="button" tabIndex={0} aria-label="远处的星球：共学" onClick={() => onHotspot?.("galaxy")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onHotspot?.("galaxy"); } }}
        onMouseEnter={() => setHover("galaxy")} onMouseLeave={() => setHover(null)}>
        <circle cx={1210} cy={120} r={40} fill="#B9A9D6" /><ellipse cx={1210} cy={120} rx={70} ry={14} fill="none" stroke="#F2D7B8" strokeWidth={5} transform="rotate(-14 1210 120)" />
        <ellipse cx={1210} cy={82} rx={12} ry={5} fill="#94B77C" />
      </g>
      <circle cx={230} cy={170} r={18} fill="#F2C9B6" /><circle cx={420} cy={90} r={8} fill="#9CAFC5" />
      {/* 星球地表（只露出上半部分的球冠） */}
      <ellipse cx={CX} cy={HORIZON + 1150} rx={1500} ry={1160} fill="url(#sg-ground)" />
      <ellipse cx={CX} cy={HORIZON + 1150} rx={1500} ry={1160} fill="none" stroke="#FFF7E8" strokeOpacity={0.35} strokeWidth={4} />
      {[[400, 520, 140], [1000, 640, 180], [720, 760, 220], [260, 760, 120]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.32} fill={i % 2 ? "#B5C592" : "#94AE7E"} opacity={0.3} />)}
      {/* 小路 */}
      <g className="sg-hot" role="button" tabIndex={0} aria-label="回忆小径：历史问答" onClick={() => onHotspot?.("path")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onHotspot?.("path"); } }}
        onMouseEnter={() => setHover("path")} onMouseLeave={() => setHover(null)}>
        <path d={pathD(memPts)} stroke="#D9C9A6" strokeWidth={36} strokeLinecap="round" fill="none" opacity={0.6} />
        <path d={pathD(memPts)} stroke="#EBDDBE" strokeWidth={28} strokeLinecap="round" fill="none" />
        {MEMORY_PATH.slice(1).map(([x, z], i) => { const p = P(x, z); return <ellipse key={i} cx={p.x} cy={p.y} rx={16 * p.s} ry={7 * p.s} fill="#B9B2C9" />; })}
      </g>
      <path d={pathD(greenPts)} stroke="#EBDDBE" strokeWidth={20} strokeLinecap="round" fill="none" opacity={0.9} />
      {items.map((i) => <React.Fragment key={i.key}>{i.el}</React.Fragment>)}
      <StarLampIcon x={lampPos.x} y={lampPos.y - 150 * lampPos.s} />
      {hoverText && <text x={CX} y={150} textAnchor="middle" className="sg-label">{hoverText}</text>}
    </svg>
  );
}
