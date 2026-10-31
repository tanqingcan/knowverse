"use client";
/**
 * 3D 绘本微缩花园（React Three Fiber）。
 *  - 固定的 3/4 俯视最佳角度：花园位于星球北极的球冠上，下半球被画面与云海裁掉；
 *    只允许有限拖动（左右 ±34°、俯仰少量），一键回到花园视角，不会连续自转到背面。
 *  - 主花圃（本命花）居中，资料温室、星灯书屋、回忆小径、长椅与路灯、旅人与星灯围绕布置。
 *  - 三段动画：进入花园（可跳过，之后更短）、选择花朵（镜头轻移）、独立验证完成（后端保存后：光点沿小径汇入花圃 → 新阶段模型展开）。
 *  - prefers-reduced-motion / 低动效：无镜头动画与粒子，阶段直接切换。
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { C, matte, PLANET_R, haloTexture, sphereGeo, cylGeo, grassTuftGeo, rand, contactGeo, contactMat, torusGeo } from "./geo";
import { Flower3D } from "./Flower3D";
import { Bench, CloudRing, Cottage, DistantPlanet, GardenArch, GardenBed, Greenhouse, Lamp, Observatory, PondBridge, SeedShed, Sign, SteppingStone } from "./Props3D";
import { StarLamp, SurfaceMover, Traveler, type Pose } from "./Characters3D";
import { capFrame, capToAzPolar, layoutBeds, MEMORY_PATH, GREEN_PATH, STAR_PATH, SEED_PATH, pathCurve, scatter, SPOTS, TREES, WILD, WILD_ROCKS, type BedLayout, type WorldPlant } from "./layout";
import { DecorStone } from "./Decor3D";
import { paintTerrain, planetGeometry } from "./terrain";
import type { StageKey } from "@/lib/flora";
import { DECOR_CATALOG, isBuildingKind, type BuildingKind, type DecorPlacement } from "@/lib/decor";
import { doorOf, homePoses } from "@/lib/home/home-layout";
import { DecorItem } from "./DecorItem";
import { SphereSurface } from "./Surface3D";

export type Hotspot = "cottage" | "greenhouse" | "path" | "galaxy" | "observatory";
export type Celebration = { plantId: string; fromStage: StageKey; toStage: StageKey; key: number } | null;

export type WorldProps = {
  plants: WorldPlant[]; gardens: { name: string }[];
  selectedId?: string | null; onSelect?: (id: string) => void; onHotspot?: (h: Hotspot) => void;
  mode: "garden" | "focus"; reduced: boolean; celebrate?: Celebration; onGrowthShown?: (c: NonNullable<Celebration>) => void;
  pose: Pose; lampState: "idle" | "think" | "celebrate" | "guide";
  signText: string; signSub?: string; recenterKey: number; focusBed?: { x: number; z: number; key: number } | null; onDragged?: (b: boolean) => void;
  hoverLabel?: (key: string) => string | null; intro?: "long" | "short" | "none"; onIntroDone?: () => void;
  decor?: DecorPlacement[];
  onDecorMove?: (id: string, x: number, z: number) => void;
  placingKind?: string | null;   // 创造模式：正在放置的素材 kind；非空时点击球面放置
  /** H06/H21：放置预览（跟随指针的半透明 ghost）+ 选中确认。
   *  素材栏选材时用该 kind 的默认参数；复制时用被复制实例的参数，保证预览=最终结果。 */
  placingPreview?: { kind: string; rot: number; scale: number; color?: string; stage?: string } | null;
  onPlace?: (x: number, z: number) => void; // 点击球面放置回调
  onDecorSelect?: (id: string) => void;    // 创造模式：选中已放置对象
  onDecorDuplicate?: (id: string) => void; // H05：紧凑操作条的「复制」
  onDecorRemove?: (id: string) => void;    // H05：紧凑操作条的「删除」
  selectedDecorId?: string | null;         // 当前选中的装饰对象
  readOnly?: boolean;
  paused?: boolean; // 编辑/浮窗期间暂停空闲慢转（G7）
  editing?: boolean; // 创造模式（H02/H08）：编辑时点击建筑只选中，不触发业务热点
  perf?: boolean; // 开发用：显示 FPS / draw calls / 三角面
  onFail: () => void;
};

const ELEV = (38 * Math.PI) / 180;
const EYE_DIR = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
const LOOK = new THREE.Vector3(0, PLANET_R - 0.12, 0.02);
/** 世界绕 X 的俯仰范围：负值看赤道、正值看北极 */
const TILT_MIN = -0.34;
const TILT_MAX = 0.62;

const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

/** H04：群组密度倍率夹在 0.2–3，避免 0 或过大导致看不到/卡顿 */
function clampDensity(v: number) {
  return Number.isFinite(v) ? Math.max(0.2, Math.min(3, v)) : 1;
}

/**
 * 建筑热点表（H02/H08）：建筑改为可编辑实例后，热点随实例位置走（不再是 SPOTS 固定渲染）。
 * clickable=true 的建筑保留原业务入口（对话/资料/观测台）；false 的只做悬停标签。
 */
const BUILDING_HIT: Record<string, { name: string; r: number; h: number; labelY: number; clickable: boolean }> = {
  cottage: { name: "cottage", r: 0.34, h: 0.9, labelY: 0.95, clickable: true },
  greenhouse: { name: "greenhouse", r: 0.32, h: 0.45, labelY: 0.48, clickable: true },
  observatory: { name: "observatory", r: 0.3, h: 0.36, labelY: 0.3, clickable: true },
  seedshed: { name: "seedshed", r: 0.3, h: 0.4, labelY: 0.32, clickable: false },
  arch: { name: "arch", r: 0.18, h: 0.5, labelY: 0.42, clickable: false },
  pond: { name: "pond", r: 0.5, h: 0.2, labelY: 0.16, clickable: false },
  sign: { name: "sign", r: 0.2, h: 0.3, labelY: 0.2, clickable: false },
};

/** 世界坐标点 → 球冠平面坐标 (x,z)，与 capToAzPolar 互逆 */
function pointToCap(p: THREE.Vector3) {
  const r = p.length() || 1;
  const polar = Math.acos(Math.max(-1, Math.min(1, p.y / r)));
  const d = polar * PLANET_R;
  const az = Math.atan2(p.x, p.z);
  return { x: Math.sin(az) * d, z: Math.cos(az) * d };
}

/* ───────── 花圃里的一株植物（含成长动画） ───────── */
function PlantNode({ p, x, z, k = 1, selected, hovered, reduced, fx, onSelect, setHover, register }: {
  p: WorldPlant; x: number; z: number; k?: number; selected: boolean; hovered: boolean; reduced: boolean;
  fx: { from: StageKey; to: StageKey; start: number } | null;
  onSelect?: (id: string) => void; setHover: (k: string | null) => void; register: (k: string, o: THREE.Object3D | null) => void;
}) {
  const g = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const [phase, setPhase] = useState<"before" | "after">("after");
  const bloomAtMount = p.stage === "bloom";
  const [open, setOpen] = useState(bloomAtMount ? 0.1 : 1);
  const lastOpen = useRef(bloomAtMount ? 0.1 : 1);
  const firstFx = useRef(true);
  useEffect(() => {
    if (firstFx.current) { firstFx.current = false; return; } // 入场展开交给 useFrame
    if (fx && !reduced) { setPhase("before"); setOpen(fx.to === "bloom" ? 0.08 : 1); } else { setPhase("after"); setOpen(1); }
  }, [fx, reduced]);
  useFrame(() => {
    const now = performance.now();
    // 入场「生长」：约 0.9s 从小长到满，按 id 错峰
    if (born.current === null) born.current = now + (hashId(p.id) % 320);
    const m = reduced ? 1 : Math.min(1, Math.max(0, (now - born.current) / 900));
    const me = 1 - Math.pow(1 - m, 3);
    if (!fx || reduced || !g.current) {
      if (g.current) g.current.scale.setScalar(reduced ? 1 : 0.22 + 0.78 * me + Math.sin(m * Math.PI) * 0.06);
      // 入场「花瓣展开」：同一条时间轴，从 0.1 张到 1
      if (!reduced && bloomAtMount) {
        const o = Math.min(1, 0.1 + 0.9 * me);
        if (Math.abs(o - lastOpen.current) > 0.04) { lastOpen.current = o; setOpen(o); }
      }
      return;
    }
    const t = (performance.now() - fx.start) / 1000;
    if (t < 1.5) { if (phase !== "before") setPhase("before"); g.current.scale.setScalar(1 - Math.max(0, t - 1.2) * 1.2); return; }
    if (phase !== "after") setPhase("after");
    const k = Math.min(1, (t - 1.5) / 0.7);
    const e = 1 - Math.pow(1 - k, 3);
    g.current.scale.setScalar(0.6 + 0.4 * e + Math.sin(k * Math.PI) * 0.08);
    if (fx.to === "bloom") {
      const o = Math.min(1, Math.max(0.08, (t - 1.7) / 1.4));
      if (Math.abs(o - lastOpen.current) > 0.05 || (o === 1 && lastOpen.current !== 1)) { lastOpen.current = o; setOpen(o); }
    }
  });
  const stage = fx && !reduced && phase === "before" ? fx.from : p.stage;
  const scale = (p.isNatal ? 2.3 : 1.7) * k;
  return (
    <group position={[x, 0.032, z]}>
      <group ref={g}>
        <Flower3D species={p.species} color={p.color} stage={stage} open={open} seed={(hashId(p.id) % 97) + 1} selected={selected} hovered={hovered} reduced={reduced} scale={scale} hideContact />
      </group>
      {p.reviewDue && <mesh geometry={sphereGeo(0.012, 10, 8)} material={matte("#F4DFA6", { emissive: "#F4DFA6", emissiveIntensity: 0.8 })} position={[0.07, 0.03, 0.04]} />}
      <group ref={(o) => register(`plant:${p.id}`, o)} position={[0, (p.stage === "bloom" || p.stage === "bud" ? 0.42 : 0.2) * (scale / 1.22) * 0.8, 0]} />
    </group>
  );
}
function hashId(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }

/**
 * 一个花圃的「拾取圆柱」合并成一次绘制：原来每株一个不可见的 cylinder，100 株就是 100 次 draw。
 * R3F 的实例化事件会带 instanceId，序号与 `bed.plants` 下标一致，所以选中/悬停语义不变。
 */
function BedHits({ items, setHover, onSelect }: {
  items: { id: string; x: number; z: number }[];
  setHover: (k: string | null) => void;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    items.forEach((it, i) => { mx.compose(new THREE.Vector3(it.x, 0.26, it.z), q, one); m.setMatrixAt(i, mx); });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
  }, [items]);
  const idAt = (i: number | undefined | null) => (i == null ? null : items[i]?.id ?? null);
  return (
    <instancedMesh ref={ref} args={[cylGeo(0.1, 0.1, 0.55, 8), hitMat, Math.max(1, items.length)]}
      visible={items.length > 0} frustumCulled={false}
      onPointerOver={(e) => { const k = idAt(e.instanceId); if (k) { e.stopPropagation(); setHover(`plant:${k}`); } }}
      onPointerOut={() => setHover(null)}
      onClick={(e) => { const k = idAt(e.instanceId); if (!k || e.delta > 6) return; e.stopPropagation(); onSelect?.(k); }} />
  );
}

/** 接触阴影同理：每株一个贴地圆片，合并成一个实例化网格 */
function BedContacts({ items }: { items: { x: number; z: number; s: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion();
    items.forEach((it, i) => { mx.compose(new THREE.Vector3(it.x, 0.034, it.z), q, new THREE.Vector3(it.s, it.s, it.s)); m.setMatrixAt(i, mx); });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[contactGeo(), contactMat(), Math.max(1, items.length)]} visible={items.length > 0} frustumCulled={false} />;
}

function Bed({ bed, plants, ...rest }: { bed: BedLayout; plants: Map<string, WorldPlant> } & Omit<React.ComponentProps<typeof PlantNode>, "p" | "x" | "z" | "selected" | "hovered" | "fx"> & { selectedId?: string | null; hover: string | null; fx: { id: string; from: StageKey; to: StageKey; start: number } | null }) {
  const f = useMemo(() => capFrame(bed.x, bed.z), [bed.x, bed.z]);
  const { selectedId, hover, fx, ...pass } = rest as any;
  const hitItems = useMemo(() => bed.plants.map((pp) => ({ id: pp.id, x: pp.x, z: pp.z })), [bed.plants]);
  const contactItems = useMemo(() => bed.plants.map((pp) => ({ x: pp.x, z: pp.z, s: plants.get(pp.id)?.stage === "bloom" ? 0.11 : 0.08 })), [bed.plants, plants]);
  return (
    <group position={f.pos} quaternion={f.quat}>
      <mesh geometry={cylGeo(bed.r * 1.05, bed.r * 1.08, 0.12, 40)} material={matte(C.soilDeep)} position={[0, -0.05, 0]} />
      <GardenBed r={bed.r} />
      {bed.plants.map((pp) => {
        const p = plants.get(pp.id); if (!p) return null;
        return <PlantNode key={pp.id} p={p} x={pp.x} z={pp.z} k={bed.main ? 1 : 0.8} selected={selectedId === p.id} hovered={hover === `plant:${p.id}`}
          fx={fx && fx.id === p.id ? fx : null} {...pass} />;
      })}
      <BedHits items={hitItems} setHover={pass.setHover} onSelect={pass.onSelect} />
      <BedContacts items={contactItems} />
    </group>
  );
}

/* ───────── 地表上的物体 ───────── */
function OnCap({ x, z, yaw = 0, lift = 0, upright = 0, children }: { x: number; z: number; yaw?: number; lift?: number; upright?: number; children: React.ReactNode }) {
  const f = useMemo(() => capFrame(x, z, yaw, lift), [x, z, yaw, lift]);
  const q = useMemo(() => {
    if (!upright) return f.quat;
    // 家具保持竖直：把「贴合球面」的四元数向「只绕世界 Y 偏航」插值。
    // H10：竖直程度按纬度衰减——赤道附近仍硬直立会与球面穿插，靠近北极才完全竖直。
    const polarRad = Math.hypot(x, z) / 3;
    const k = Math.max(0, Math.min(1, upright * Math.cos(polarRad)));
    if (!k) return f.quat;
    const up = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yaw * Math.PI) / 180);
    return f.quat.clone().slerp(up, k);
  }, [f.quat, yaw, upright, x, z]);
  return <group position={f.pos} quaternion={q}>{children}</group>;
}

function Grass({ items }: { items: ReturnType<typeof scatter> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => grassTuftGeo(), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, color: "#ffffff" }), []);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mx = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const tones = ["#9DB983", "#AFC791", "#8FAD78", "#BCD09B"];
    items.forEach((it, i) => {
      const f = capFrame(it.x, it.z, (it.yaw * 180) / Math.PI);
      q.copy(f.quat);
      mx.compose(f.pos, q, new THREE.Vector3(it.s, it.s * (0.8 + (i % 3) * 0.2), it.s));
      m.setMatrixAt(i, mx); m.setColorAt(i, col.set(tones[it.tone]));
    });
    void up;
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} frustumCulled={false} receiveShadow />;
}

/** 前景低云：裹住星球前缘，缩小下半球在画面中的占比（InstancedMesh，一次绘制 + 实例色） */
function FrontClouds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const puffs = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const x = -2.7 + (i / 15) * 5.4 + (rand(i, 1) - 0.5) * 0.3;
    const z = 1.78 - Math.abs(x) * 0.12 + rand(i, 2) * 0.22;
    return { x, z, s: 0.28 + rand(i, 3) * 0.22, lift: 0.02 + rand(i, 4) * 0.06, c: i % 5 === 0 ? "#F7DCCF" : i % 3 === 0 ? "#EFE6F3" : "#FFF7EE" };
  }), []);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mx = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion();
    puffs.forEach((p, i) => {
      const f = capFrame(p.x, p.z, 0, p.lift);
      q.copy(f.quat);
      mx.compose(f.pos, q, new THREE.Vector3(p.s * 1.4, p.s * 0.7, p.s));
      m.setMatrixAt(i, mx); m.setColorAt(i, col.set(p.c));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [puffs]);
  return <instancedMesh ref={ref} args={[sphereGeo(1, 18, 12), matte("#ffffff", { rough: 1 }), puffs.length]} />;
}

/** 树木与灌木按几何类型合批（树干/树冠/灌木球/灌木花/接触阴影，各 1 次 draw）。纯装饰、无交互、无动画。 */
type FloraItem = { x: number; z: number; kind: "tree" | "bush"; seed: number; tint?: string };
function FloraField({ items }: { items: FloraItem[] }) {
  const refs = {
    trunk: useRef<THREE.InstancedMesh>(null),
    crown: useRef<THREE.InstancedMesh>(null),
    bush: useRef<THREE.InstancedMesh>(null),
    flower: useRef<THREE.InstancedMesh>(null),
    contact: useRef<THREE.InstancedMesh>(null),
  };
  const data = useMemo(() => {
    type Inst = { pos: THREE.Vector3; quat: THREE.Quaternion; s: [number, number, number]; c?: string };
    const trunk: Inst[] = [], crown: Inst[] = [], bush: Inst[] = [], flower: Inst[] = [], contact: Inst[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const CROWN = [[0, 0.36, 0, 0.15], [0.1, 0.31, 0.03, 0.11], [-0.1, 0.32, 0.02, 0.11], [0.02, 0.43, -0.03, 0.1]] as const;
    const BALL = [[0, 0.06, 0, 0.08], [0.07, 0.045, 0.02, 0.06], [-0.06, 0.045, 0.03, 0.058], [0.01, 0.04, 0.07, 0.05]] as const;
    items.forEach((it) => {
      const f = capFrame(it.x, it.z);
      const rot = new THREE.Quaternion().setFromAxisAngle(up, rand(it.seed, 1) * 6);
      const baseQ = f.quat.clone().multiply(rot);
      const at = (x: number, y: number, z: number) => f.pos.clone().add(new THREE.Vector3(x, y, z).applyQuaternion(baseQ));
      if (it.kind === "tree") {
        contact.push({ pos: f.pos.clone().add(new THREE.Vector3(0, 0.004, 0).applyQuaternion(f.quat)), quat: f.quat.clone(), s: [0.22, 0.22, 0.22] });
        trunk.push({ pos: at(0, 0.14, 0), quat: baseQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.08))), s: [1, 1, 1] });
        CROWN.forEach(([x, y, z, r], i) => crown.push({ pos: at(x, y, z), quat: baseQ.clone(), s: [r, r, r], c: i % 2 ? (it.tint ?? "#EBB2BB") : "#F2C6CC" }));
      } else {
        contact.push({ pos: f.pos.clone().add(new THREE.Vector3(0, 0.004, 0).applyQuaternion(f.quat)), quat: f.quat.clone(), s: [0.14, 0.14, 0.14] });
        BALL.forEach(([x, y, z, r], i) => bush.push({ pos: at(x, y, z), quat: baseQ.clone(), s: [r, r, r], c: i % 2 ? (it.tint ?? "#8DAF78") : "#A3C28B" }));
        if (rand(it.seed, 5) > 0.4) [0, 1, 2].forEach((i) => flower.push({ pos: at(Math.cos(i * 2.1) * 0.07, 0.1 - i * 0.012, Math.sin(i * 2.1) * 0.07), quat: baseQ.clone(), s: [1, 1, 1], c: ["#F4D9DF", "#FFF7E8", "#F2C9B6"][i] }));
      }
    });
    return { trunk, crown, bush, flower, contact };
  }, [items]);

  useEffect(() => {
    const groups: [keyof typeof refs, typeof data.trunk][] = [
      ["trunk", data.trunk], ["crown", data.crown], ["bush", data.bush], ["flower", data.flower],
    ];
    const mx = new THREE.Matrix4(), col = new THREE.Color(), v = new THREE.Vector3();
    for (const [key, list] of groups) {
      const m = refs[key].current; if (!m) continue;
      list.forEach((it, i) => { mx.compose(it.pos, it.quat, v.set(...it.s)); m.setMatrixAt(i, mx); if (it.c) m.setColorAt(i, col.set(it.c)); });
      m.count = list.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const cm = refs.contact.current;
    if (cm) {
      data.contact.forEach((it, i) => { mx.compose(it.pos, it.quat, v.set(...it.s)); cm.setMatrixAt(i, mx); });
      cm.count = data.contact.length; cm.instanceMatrix.needsUpdate = true;
    }
  }, [data]);

  return (
    <>
      <instancedMesh ref={refs.trunk} args={[cylGeo(0.022, 0.035, 0.28, 10), matte("#ffffff"), Math.max(1, data.trunk.length)]} castShadow />
      <instancedMesh ref={refs.crown} args={[sphereGeo(1, 16, 12), matte("#ffffff"), Math.max(1, data.crown.length)]} castShadow />
      <instancedMesh ref={refs.bush} args={[sphereGeo(1, 14, 10), matte("#ffffff"), Math.max(1, data.bush.length)]} castShadow />
      <instancedMesh ref={refs.flower} args={[sphereGeo(0.012, 8, 6), matte("#ffffff"), Math.max(1, data.flower.length)]} />
      <instancedMesh ref={refs.contact} args={[contactGeo(), contactMat(), Math.max(1, data.contact.length)]} />
    </>
  );
}

/** 草地上的小野花（两组实例化网格：花冠 + 花心），只是装饰，不代表任何学习记录 */
function Wildflowers({ items }: { items: ReturnType<typeof scatter> }) {
  const a = useRef<THREE.InstancedMesh>(null), b = useRef<THREE.InstancedMesh>(null), st = useRef<THREE.InstancedMesh>(null);
  const petal = useMemo(() => new THREE.SphereGeometry(1, 10, 6), []);
  const stem = useMemo(() => new THREE.CylinderGeometry(0.0025, 0.003, 1, 4).translate(0, 0.5, 0), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, color: "#ffffff" }), []);
  useEffect(() => {
    const mx = new THREE.Matrix4(), col = new THREE.Color(), up = new THREE.Vector3();
    const tones = ["#FFF7E8", "#F4D9DF", "#F2C9B6", "#D9CCEB", "#FFF7E8"];
    items.forEach((it, i) => {
      const h = 0.03 + (i % 3) * 0.012;
      const f = capFrame(it.x, it.z, (it.yaw * 180) / Math.PI);
      up.set(0, 1, 0).applyQuaternion(f.quat);
      const top = f.pos.clone().addScaledVector(up, h);
      st.current?.setMatrixAt(i, mx.compose(f.pos, f.quat, new THREE.Vector3(1, h, 1)));
      a.current?.setMatrixAt(i, mx.compose(top, f.quat, new THREE.Vector3(0.016 * it.s, 0.006, 0.016 * it.s)));
      a.current?.setColorAt(i, col.set(tones[i % tones.length]));
      b.current?.setMatrixAt(i, mx.compose(top.clone().addScaledVector(up, 0.004), f.quat, new THREE.Vector3(0.006, 0.004, 0.006)));
    });
    for (const m of [a.current, b.current, st.current]) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }, [items]);
  return (
    <>
      <instancedMesh ref={st} args={[stem, matte(C.stem), items.length]} frustumCulled={false} />
      <instancedMesh ref={a} args={[petal, mat, items.length]} frustumCulled={false} castShadow />
      <instancedMesh ref={b} args={[petal, matte(C.honey), items.length]} frustumCulled={false} />
    </>
  );
}

/** 回忆小径的石板（也是“回顾”入口的点击区域） */
function MemoryPath({ setHover, onHotspot, poses }: { setHover: (k: string | null) => void; onHotspot?: (h: Hotspot) => void; poses: Record<string, { x: number; z: number; yaw: number }> }) {
  // H09：四条小路按当前建筑位置重建端点（书房/温室门口、观测台、种子棚），建筑搬走后不会留下旧印迹。
  const paths = useMemo(() => {
    const cDef = { x: SPOTS.cottage.x, z: SPOTS.cottage.z, yaw: SPOTS.cottage.yaw };
    const gDef = { x: SPOTS.greenhouse.x, z: SPOTS.greenhouse.z, yaw: SPOTS.greenhouse.yaw };
    const cDoor = doorOf(poses.cottage, cDef, SPOTS.cottageDoor);
    const gDoor = doorOf(poses.greenhouse, gDef, SPOTS.greenhouseDoor);
    const toPair = (p: { x: number; z: number }): [number, number] => [p.x, p.z];
    return {
      memory: [...MEMORY_PATH.slice(0, -1), toPair(cDoor)],
      green: [...GREEN_PATH.slice(0, -1), toPair(gDoor)],
      star: [toPair(gDoor), ...STAR_PATH.slice(1, -1), [poses.observatory.x, poses.observatory.z] as [number, number]],
      seed: [toPair(gDoor), ...SEED_PATH.slice(1, -1), [poses.seedshed.x, poses.seedshed.z] as [number, number]],
    };
  }, [poses]);
  const stones = useMemo(() => pathCurve(paths.memory).getSpacedPoints(9).slice(1, -1).map((v, i) => ({ x: v.x + (i % 2 ? 0.025 : -0.02), z: v.z, s: 0.85 + rand(i, 7) * 0.4, i })), [paths]);
  const g2 = useMemo(() => pathCurve(paths.green).getSpacedPoints(6).slice(1, -1).map((v, i) => ({ x: v.x, z: v.z, s: 0.7 + rand(i, 9) * 0.3, i: i + 20 })), [paths]);
  const g3 = useMemo(() => pathCurve(paths.star).getSpacedPoints(9).slice(1, -1).map((v, i) => ({ x: v.x, z: v.z, s: 0.66 + rand(i, 11) * 0.28, i: i + 40 })), [paths]);
  const g4 = useMemo(() => pathCurve(paths.seed).getSpacedPoints(5).slice(1, -1).map((v, i) => ({ x: v.x, z: v.z, s: 0.66 + rand(i, 13) * 0.26, i: i + 60 })), [paths]);
  return (
    <>
      {stones.map((s) => (
        <OnCap key={s.i} x={s.x} z={s.z}>
          <SteppingStone s={s.s} seed={s.i} />
          <mesh geometry={cylGeo(0.09, 0.09, 0.05, 8)} material={hitMat} position={[0, 0.02, 0]}
            onPointerOver={(e) => { e.stopPropagation(); setHover("path"); }} onPointerOut={() => setHover(null)}
            onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onHotspot?.("path"); }} />
        </OnCap>
      ))}
      {g2.map((s) => <OnCap key={s.i} x={s.x} z={s.z}><SteppingStone s={s.s} seed={s.i} /></OnCap>)}
      {g3.map((s) => <OnCap key={s.i} x={s.x} z={s.z}><SteppingStone s={s.s} seed={s.i} /></OnCap>)}
      {g4.map((s) => <OnCap key={s.i} x={s.x} z={s.z}><SteppingStone s={s.s} seed={s.i} /></OnCap>)}
    </>
  );
}

function Hit({ name, r, h, y = 0, setHover, onHotspot }: { name: Hotspot; r: number; h: number; y?: number; setHover: (k: string | null) => void; onHotspot?: (h: Hotspot) => void }) {
  return (
    <mesh geometry={cylGeo(r, r, h, 10)} material={hitMat} position={[0, y + h / 2, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHover(name); }} onPointerOut={() => setHover(null)}
      onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onHotspot?.(name); }} />
  );
}

/** 只悬停、不点击的命中区：装饰性建筑有标签、没有假功能入口 */
function LabelHit({ name, r, h, y = 0, setHover }: { name: string; r: number; h: number; y?: number; setHover: (k: string | null) => void }) {
  return (
    <mesh geometry={cylGeo(r, r, h, 10)} material={hitMat} position={[0, y + h / 2, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHover(name); }} onPointerOut={() => setHover(null)} />
  );
}

/** 成长光点：从星灯书屋门口沿回忆小径飞入花圃 */
function Sparks({ points, start }: { points: THREE.Vector3[]; start: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, "centripetal"), [points]);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#FFE9B8" }), []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    const t = (performance.now() - start) / 1000;
    refs.current.forEach((s, i) => {
      if (!s) return;
      const k = (t - i * 0.09) / 1.25;
      if (k <= 0 || k >= 1) { s.visible = false; return; }
      s.visible = true;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      s.position.copy(curve.getPoint(e));
      s.position.y += Math.sin(k * Math.PI * 2 + i) * 0.02;
      const sc = 0.17 * (1 - k * 0.35);
      s.scale.set(sc, sc, 1);
    });
  });
  return <group>{Array.from({ length: 9 }, (_, i) => <sprite key={i} ref={(o) => { refs.current[i] = o; }} material={mat} visible={false} />)}</group>;
}

/* ───────── 镜头、拖动、入场 ───────── */
function Rig({ mode, reduced, paused, focusPoint, drag, zoom, intro, onIntroDone, worldRef }: {
  mode: "garden" | "focus"; reduced: boolean; paused?: boolean; focusPoint: THREE.Vector3 | null;
  drag: React.MutableRefObject<{ yaw: number; tilt: number }>; zoom: React.MutableRefObject<number>;
  intro: "long" | "short" | "none"; onIntroDone?: () => void;
  worldRef: React.RefObject<THREE.Group | null>;
}) {
  const { camera, size } = useThree();
  const acc = useRef(0);
  const lastInteract = useRef(0); // 最后一次按下/拖动的时间（空闲慢转用）
  const pressing = useRef(false);  // 指针是否按下（按下期间不慢转）
  const wall = useRef<number | null>(null); // 入场动画已播放的时间（每帧最多计 50ms：首帧编译着色器很慢时动画不会被跳过）
  const done = useRef(intro === "none" || reduced);
  const look = useRef(LOOK.clone());
  const dist = useRef(0);
  const cur = useRef({ yaw: 0, tilt: 0 });
  const dur = intro === "long" ? 2.6 : 1.1;
  useEffect(() => {
    const skip = () => { if (!done.current) { done.current = true; onIntroDone?.(); } };
    window.addEventListener("keydown", skip); window.addEventListener("pointerdown", skip);
    return () => { window.removeEventListener("keydown", skip); window.removeEventListener("pointerdown", skip); };
  }, [onIntroDone]);
  // 记录最后一次交互时间：空闲慢转在按下后暂停，释放 3 秒后恢复
  useEffect(() => {
    const down = (e: PointerEvent) => { pressing.current = true; lastInteract.current = performance.now(); };
    const up = () => { pressing.current = false; lastInteract.current = performance.now(); };
    const move = (e: PointerEvent) => { if (e.buttons) { pressing.current = true; lastInteract.current = performance.now(); } };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("pointermove", move);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); window.removeEventListener("pointermove", move); };
  }, []);
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const hf = Math.atan(Math.tan(((cam.fov / 2) * Math.PI) / 180) * aspect);
    const halfW = mode === "focus" ? (aspect < 0.8 ? 1.5 : 1.9) : aspect < 0.8 ? 1.42 : 1.8;
    let d = Math.max(4.4, halfW / Math.tan(hf));
    if (aspect < 0.8) d = Math.min(d, 9.5);
    const tgt = LOOK.clone();
    if (aspect < 0.8 && mode === "garden") tgt.y -= 0.18;
    if (aspect < 0.8 && mode === "focus") { tgt.z += 0.55; tgt.y -= 0.12; } // 竖屏：把花园放在画面中上部，给底部卡片留空间
    if (focusPoint && mode === "garden") { tgt.lerp(focusPoint, 0.38); d *= 0.8; if (aspect > 1.1) tgt.x += 0.42; else { tgt.z += 0.95; tgt.y -= 0.1; } } // 侧卡 / 底部抽屉不遮住选中的花
    // 入场
    let introK = 1;
    if (!done.current) {
      acc.current += Math.min(dt, 0.05);
      if (wall.current == null) wall.current = performance.now();
      introK = performance.now() - wall.current > 4200 ? 1 : Math.min(1, acc.current / dur); // 极慢的设备上最多 4.2 秒
      if (introK >= 1) { done.current = true; onIntroDone?.(); }
    }
    const e = 1 - Math.pow(1 - introK, 3);
    const elev = ELEV + (1 - e) * 0.32 + (aspect < 0.8 ? 0.2 : 0);
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const wantD = d * Math.max(0.75, Math.min(2.2, zoom.current)) * (1 + (1 - e) * 1.1);
    const k = reduced || dist.current === 0 ? 1 : done.current ? Math.min(1, dt * 3) : 1;
    dist.current += (wantD - dist.current) * k;
    look.current.lerp(tgt, k);
    cam.position.copy(look.current).addScaledVector(dir, dist.current);
    cam.lookAt(look.current);
    // G7 空闲慢转：仅 garden、非低动效、无浮窗/编辑时；按下暂停，释放 3 秒后平滑恢复
    if (!reduced && !paused && mode === "garden" && done.current && !pressing.current && performance.now() - lastInteract.current > 3000) {
      drag.current.yaw += dt * 0.03;
    }
    // 拖动（有限范围）
    const kd = reduced ? 1 : Math.min(1, dt * 6);
    cur.current.yaw += (drag.current.yaw - cur.current.yaw) * kd;
    cur.current.tilt += (drag.current.tilt - cur.current.tilt) * kd;
    if (worldRef.current) { worldRef.current.rotation.y = cur.current.yaw; worldRef.current.rotation.x = cur.current.tilt; }
    if (typeof window !== "undefined") (window as any).__gardenYaw = cur.current.yaw; // G7 复位/慢转的可测探针
  });
  return null;
}

/** 悬停 / 选中标签：每帧把锚点投影到屏幕，直接写 DOM，不触发 React 渲染 */
function LabelTracker({ anchors, labelKey, el, minX = 0 }: { anchors: React.MutableRefObject<Map<string, THREE.Object3D>>; labelKey: string | null; el: React.RefObject<HTMLDivElement | null>; minX?: number }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const d = el.current; if (!d) return;
    const o = labelKey ? anchors.current.get(labelKey) : null;
    if (!o) { d.style.opacity = "0"; return; }
    o.getWorldPosition(v); v.project(camera);
    d.style.opacity = "1";
    // H05 审查：操作条投影到左侧素材栏下方时会被遮挡，最小 x 夹到面板右侧外
    const x = Math.max(minX, (v.x * 0.5 + 0.5) * size.width);
    d.style.transform = `translate(${x.toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, -100%)`;
  });
  return null;
}

/** 性能探针：FPS / draw calls / 三角面 / 几何与纹理数；写 #perf-hud 与 window.__gardenPerf（G11 采样用） */
function PerfProbe() {
  const { gl } = useThree();
  const frames = useRef(0);
  const last = useRef(performance.now());
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - last.current >= 500) {
      const fps = Math.round((frames.current * 1000) / (now - last.current));
      const mem = gl.info.memory;
      const sample = { fps, calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: mem.geometries, textures: mem.textures, programs: gl.info.programs?.length ?? 0, t: Date.now() };
      const el = document.getElementById("perf-hud");
      if (el) el.textContent = `${fps} fps · ${sample.calls} draw · ${sample.triangles} tri`;
      (window as any).__gardenPerf = sample;
      frames.current = 0;
      last.current = now;
    }
  });
  return null;
}

function Scene(props: WorldProps & { labelEl: React.RefObject<HTMLDivElement | null>; hover: string | null; setHover: (k: string | null) => void; drag: React.MutableRefObject<{ yaw: number; tilt: number }>; zoom: React.MutableRefObject<number>; decorDrag: React.MutableRefObject<string | null>; lastDecorMove: React.MutableRefObject<number>; pointerToCap: React.MutableRefObject<((cx: number, cy: number) => { x: number; z: number } | null) | null>; selEl: React.RefObject<HTMLDivElement | null> }) {
  const { plants, gardens, selectedId, reduced, celebrate, hover, setHover } = props;
  const world = useRef<THREE.Group>(null);
  // H02：把「屏幕坐标 → 球冠坐标」暴露给外层 DOM 拖动。R3F 的 pointermove 在拖动期间不触发
  // （实测 [h02] move 无日志），DOM 层 pointermove 才稳定；用相机射线与球面求交，避免拿建筑表面点。
  const { camera, gl } = useThree();
  const dragRay = useMemo(() => new THREE.Raycaster(), []);
  const dragNdc = useMemo(() => new THREE.Vector2(), []);
  const dragSphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(0, 0, 0), PLANET_R), []);
  useEffect(() => {
    props.pointerToCap.current = (cx: number, cy: number) => {
      const r = gl.domElement.getBoundingClientRect();
      dragNdc.set(((cx - r.left) / Math.max(1, r.width)) * 2 - 1, -((cy - r.top) / Math.max(1, r.height)) * 2 + 1);
      dragRay.setFromCamera(dragNdc, camera);
      const hit = dragRay.ray.intersectSphere(dragSphere, new THREE.Vector3());
      return hit ? pointToCap(hit) : null;
    };
    return () => { props.pointerToCap.current = null; };
  }, [camera, gl, dragRay, dragNdc, dragSphere, props.pointerToCap]);
  // H06：放置预览 ghost（跟随指针的半透明模型）
  const ghost = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = ghost.current;
    if (!g) return;
    // 克隆材质再降透明度，避免影响场景里同材质的真实实例（H07 串色问题的同源风险）。
    // 卸载时 dispose 克隆材质，避免反复进出预览累积显存（H55 资源泄漏检查相关）。
    const cloned: THREE.Material[] = [];
    g.traverse((o: any) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
        o.material.depthWrite = false;
        cloned.push(o.material);
      }
    });
    return () => { cloned.forEach((m) => m.dispose()); };
  }, [props.placingKind, props.placingPreview?.kind]);
  const anchors = useRef(new Map<string, THREE.Object3D>());
  const register = useMemo(() => (k: string, o: THREE.Object3D | null) => { if (o) anchors.current.set(k, o); else anchors.current.delete(k); }, []);
  const beds = useMemo(() => layoutBeds(gardens, plants), [gardens, plants]);
  const plantMap = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  // 内圈（花园）保持原来的密度；外圈铺满整个可见球面，转到侧面/背面也有草
  // H04：草/野花是「全星球群组」，操作单元 = 整组密度（scale 当倍率，0.2–3），不逐株进入编辑。
  const grassDensity = clampDensity((props.decor ?? []).find((d) => d.kind === "grassGroup")?.scale ?? 1);
  const bloomDensity = clampDensity((props.decor ?? []).find((d) => d.kind === "wildflowerGroup")?.scale ?? 1);
  const grass = useMemo(() => [...scatter(beds, Math.round(380 * grassDensity), 11, 2.35), ...scatter(beds, Math.round(340 * grassDensity), 23, 4.05, 2.4)], [beds, grassDensity]);
  const blooms = useMemo(() => [...scatter(beds, Math.round(140 * bloomDensity), 29, 2.35), ...scatter(beds, Math.round(120 * bloomDensity), 31, 4.05, 2.4)], [beds, bloomDensity]);
  // H09：场景锚点（门口/道路端点/地表印迹/星灯停靠）统一从布局实例推导，建筑搬走后跟着走
  const poses = useMemo(() => homePoses(props.decor), [props.decor]);
  const terrain = useMemo(() => paintTerrain(beds, poses), [beds, poses]);
  // H09：poses 变化会重绘地表纹理；旧 CanvasTexture 必须 dispose，否则拖动建筑时纹理数单调增长（实测 12→20）
  useEffect(() => () => { (terrain as unknown as { dispose?: () => void })?.dispose?.(); }, [terrain]);
  const planetGeo = useMemo(() => planetGeometry(), []);
  const planetMat = useMemo(() => new THREE.MeshStandardMaterial({ map: terrain, roughness: 1, metalness: 0 }), [terrain]);
  const [lights, setLights] = useState(props.intro === "none" || reduced ? 1 : 0.05);
  const lightAcc = useRef(0);
  const [introDone, setIntroDone] = useState(props.intro === "none" || reduced);

  // 植物在球冠平面上的位置
  const plantPos = useMemo(() => {
    const m = new Map<string, { x: number; z: number; bed: BedLayout }>();
    for (const b of beds) for (const pp of b.plants) m.set(pp.id, { x: b.x + pp.x, z: b.z + pp.z, bed: b });
    return m;
  }, [beds]);

  // 成长动画状态
  const [fx, setFx] = useState<{ id: string; from: StageKey; to: StageKey; start: number } | null>(null);
  const [sparkPts, setSparkPts] = useState<THREE.Vector3[] | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const pos = plantPos.get(celebrate.plantId);
    if (!pos) return;
    const start = performance.now();
    setFx({ id: celebrate.plantId, from: celebrate.fromStage, to: celebrate.toStage, start });
    if (!reduced) {
      const pts = [...[...MEMORY_PATH].reverse().map(([x, z]) => capFrame(x, z, 0, 0.14).pos), capFrame(pos.x, pos.z, 0, 0.42).pos, capFrame(pos.x, pos.z, 0, 0.2).pos];
      setSparkPts(pts);
    }
    const t1 = setTimeout(() => props.onGrowthShown?.(celebrate), reduced ? 200 : 2600);
    const t2 = setTimeout(() => { setSparkPts(null); setFx(null); }, reduced ? 300 : 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate?.key]);

  useFrame((_, dt) => {
    if (introDone) { if (lights < 1) setLights(1); return; }
    // 入场时书屋灯光逐渐亮起
    lightAcc.current = Math.min(1, lightAcc.current + Math.min(dt, 0.05) * (props.intro === "long" ? 0.55 : 1.4));
    const stepped = Math.round(lightAcc.current * 8) / 8; // 分级更新，避免每帧重新渲染整个场景
    if (stepped !== lights) setLights(Math.max(0.05, stepped));
  });

  const sel = selectedId ? plantPos.get(selectedId) : null;
  const celebPos = fx ? plantPos.get(fx.id) : null;
  const focusPoint = useMemo(() => (sel ? capFrame(sel.x, sel.z, 0, 0.12).pos : null), [sel]);

  // 角色位置
  const travelerAt = useMemo(() => {
    const target = props.pose === "celebrate" ? celebPos ?? sel : props.pose === "tend" ? sel : null;
    if (target) {
      const b = target.bed;
      const a = Math.atan2(target.x - b.x, target.z - b.z) + 0.9;
      const rr = b.r + 0.1;
      const x = b.x + Math.sin(a) * rr, z = b.z + Math.cos(a) * rr;
      const yaw = (Math.atan2(b.x - x, b.z - z) * 180) / Math.PI;
      return { ...capToAzPolar(x, z), yaw, lift: 0 };
    }
    // 坐姿略向前，避免背部穿过长椅靠背（靠背在 z≈-0.04，身体后半约 -0.056）
    return { ...capToAzPolar(SPOTS.bench.x, SPOTS.bench.z + 0.022), yaw: SPOTS.bench.yaw, lift: 0 };
  }, [props.pose, sel, celebPos]);
  const lampAt = useMemo(() => {
    const t = celebPos ?? sel;
    if (t) return { ...capToAzPolar(t.x + 0.12, t.z + 0.05), lift: 0.5 };
    return { ...capToAzPolar(SPOTS.lampSpot.x, SPOTS.lampSpot.z), lift: 0.36 };
  }, [sel, celebPos]);
  const travelerPose: Pose = (props.pose === "tend" && !sel) ? "idle" : props.pose;

  const L = lights;
  return (
    <>
      <hemisphereLight args={["#EDE4F7", "#8C7E86", 0.95]} />
      <ambientLight intensity={0.12} />
      <KeyLight />
      <directionalLight color="#A9BBD2" intensity={0.55} position={[6, 3, -3]} />
      <Rig mode={props.mode} reduced={reduced} paused={!!props.paused} focusPoint={focusPoint} drag={props.drag} zoom={props.zoom} intro={props.intro ?? "none"} worldRef={world}
        onIntroDone={() => { setIntroDone(true); props.onIntroDone?.(); }} />
      <LabelTracker anchors={anchors} labelKey={hover ?? (selectedId ? `plant:${selectedId}` : null)} el={props.labelEl} />
      {/* H05：选中对象的紧凑操作条跟随对象投影（与悬停标签同一套投影，不触发 React 渲染） */}
      <LabelTracker anchors={anchors} labelKey={props.selectedDecorId ? `decor:${props.selectedDecorId}` : null} el={props.selEl} minX={292} />

      {/* 天空中的远处星球（共学入口） */}
      <group position={[4.6, -2.6, -13]}>
        <DistantPlanet color="#B9A9D6" size={0.42} />
        <group ref={(o) => register("galaxy", o)} position={[0, 0.85, 0]} />
        <mesh geometry={sphereGeo(0.95, 10, 8)} material={hitMat}
          onPointerOver={(e) => { e.stopPropagation(); setHover("galaxy"); }} onPointerOut={() => setHover(null)}
          onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); props.onHotspot?.("galaxy"); }} />
      </group>
      <group position={[-5.4, -3.0, -14]}><DistantPlanet color="#F2C9B6" size={0.26} ring={false} /></group>
      <group position={[-2.2, -1.4, -16]}><DistantPlanet color="#9CAFC5" size={0.16} ring={false} /></group>

      {/* 拖动装饰/建筑：处理器挂在 world 组（任意子物体命中都会冒泡），并用「射线×球面」求交。
          原先挂在星球 mesh 上、用 e.point：指针压在建筑上时星球不触发 or 拿到建筑表面点，导致拖不动（H02 审查 #1）。 */}
      <group ref={world} onPointerMove={(e) => {
        if (!props.decorDrag.current || props.mode !== "garden") { if (props.decorDrag.current) console.log("[h02] blocked mode=", props.mode); return; } console.log("[h02] move ok");
        const now = performance.now();
        if (now - props.lastDecorMove.current < 80) return;
        props.lastDecorMove.current = now;
        const hit = e.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 0), PLANET_R), new THREE.Vector3());
        if (!hit) return;
        const c = pointToCap(hit);
        props.onDecorMove?.(props.decorDrag.current, c.x, c.z);
      }}>
        <mesh geometry={planetGeo} material={planetMat} receiveShadow />
        {/* H06/H21：放置预览 ghost——跟随指针、半透明；只在放置/复制预览时挂载 */}
        {props.placingKind && props.placingPreview && (
          <group ref={ghost} visible={false}>
            <group scale={props.placingPreview.scale}>
              <DecorItem kind={props.placingPreview.kind as any} seed={99} lights={L} tint={props.placingPreview.color} stage={props.placingPreview.stage} signText={props.signText} signSub={props.signSub} />
            </group>
            <mesh geometry={torusGeo(0.26, 0.012, 6, 40)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={matte(C.honey, { emissive: C.honey, emissiveIntensity: 0.9 })} />
          </group>
        )}
        {/* 创造模式放置层：比地表/草/云略大的不可见球，截获点击换算球冠坐标；仅放置时存在 */}
        {props.placingKind && (
          <mesh geometry={sphereGeo(3.12, 24, 16)} material={hitMat}
            onPointerMove={(e) => {
              // H06：ghost 跟随指针（命令式改 transform，不触发 React 重渲染）
              if (!ghost.current) return;
              const c = pointToCap(e.point);
              const f = capFrame(c.x, c.z, props.placingPreview?.rot ?? 0);
              ghost.current.position.copy(f.pos);
              ghost.current.quaternion.copy(f.quat);
              ghost.current.visible = true;
            }}
            onPointerOut={() => { if (ghost.current) ghost.current.visible = false; }}
            onPointerUp={(e) => {
              if (e.delta > 6) return; // 拖动（镜头）时不放置
              const c = pointToCap(e.point);
              e.stopPropagation();
              props.onPlace?.(c.x, c.z);
            }} />
        )}
        <CloudRing R={PLANET_R} />
        <Grass items={grass} />
        <Wildflowers items={blooms} />

        {beds.map((b) => (
          <Bed key={b.index} bed={b} plants={plantMap} selectedId={selectedId} hover={hover} fx={fx}
            reduced={reduced} onSelect={props.onSelect} setHover={setHover} register={register} />
        ))}

        {/* H02/H03：建筑不再按 SPOTS 固定渲染，改为布局数据里的可编辑实例（见下方 decor 循环） */}
        <MemoryPath setHover={setHover} onHotspot={props.onHotspot} poses={poses} />
        <OnCap x={0.38} z={-0.48}><group ref={(o) => register("path", o)} position={[0, 0.12, 0]} /></OnCap>
        {/* 长椅/路灯/观测台/种子棚/拱门/池塘/木牌同样来自布局数据（H02 无双轨） */}
        {/* 内圈与外圈野生树木/灌木：按几何类型合批（FloraField 内 5 个 InstancedMesh） */}
        <FloraField items={[...TREES.map((t) => ({ x: t.x, z: t.z, kind: t.kind, seed: t.seed, tint: (t as any).tint })), ...WILD.map((t) => ({ x: t.x, z: t.z, kind: t.kind, seed: t.seed, tint: t.tint }))]} />
        {WILD_ROCKS.map((r, i) => (
          <OnCap key={`r${i}`} x={r.x} z={r.z}><group scale={1.3}><DecorStone /></group></OnCap>
        ))}
        {/* 玩家摆放的装饰：surface 类（土壤/道路）走 SphereSurface 贴球面；其余走 OnCap + DecorItem */}
        {(props.decor ?? []).map((d, i) => {
          const isSurface = d.kind === "soil" || d.kind === "road";
          const isSel = props.selectedDecorId === d.id;
          const isBld = isBuildingKind(d.kind);
          const hit = isBld ? BUILDING_HIT[d.kind as BuildingKind] : undefined;
          if (isSurface) {
            return (
              <group key={d.id}
                onPointerUp={(e) => { if (props.mode === "garden" && !props.readOnly && e.delta < 6) { e.stopPropagation(); props.onDecorSelect?.(d.id); } }}>
                <SphereSurface cx={d.x} cz={d.z} width={d.width ?? 0.7} length={d.length ?? 0.7} rot={d.rot} colorKey={d.kind} />
                {isSel && <OnCap x={d.x} z={d.z} yaw={d.rot}><mesh geometry={sphereGeo(0.02, 8, 6)} material={matte(C.honey, { emissive: C.honey, emissiveIntensity: 0.8 })} position={[0, 0.05, 0]} /></OnCap>}
              </group>
            );
          }
          return (
            <OnCap key={d.id} x={d.x} z={d.z} yaw={d.rot} upright={d.kind === "chair" || d.kind === "lamp" || d.kind === "fence" || d.kind === "sign" ? 1 : 0}>
              <group scale={d.scale}
                onPointerDown={(e) => { if (props.mode !== "garden" || props.readOnly) return; e.stopPropagation(); props.decorDrag.current = d.id; }}
                onPointerUp={(e) => {
                  if (props.mode !== "garden" || props.readOnly || e.delta >= 6) return;
                  e.stopPropagation();
                  // H08：浏览模式下点建筑「模型」应打开原业务入口，而不是进创造模式；
                  // 编辑模式才选中。纯装饰建筑（无业务入口）浏览时点模型不做事，保持标签语义。
                  if (isBld && !props.editing) {
                    if (hit?.clickable) props.onHotspot?.(hit.name as Hotspot);
                    return;
                  }
                  props.onDecorSelect?.(d.id);
                }}>
                <DecorItem kind={d.kind} seed={i + 1} lights={L} tint={d.color} stage={d.stage} signText={props.signText} signSub={props.signSub} />
                {isSel && <mesh geometry={torusGeo(isBld ? 0.5 : 0.18, isBld ? 0.012 : 0.008, 6, 32)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={matte(C.honey, { emissive: C.honey, emissiveIntensity: 0.7 })} />}
              </group>
              {/* 建筑热点：非编辑模式下保留原业务/标签入口（H08）；编辑模式点击只选中，不打开业务 */}
              {hit && !props.editing && (
                hit.clickable
                  ? <Hit name={hit.name as Hotspot} r={hit.r * d.scale} h={hit.h * d.scale} setHover={setHover} onHotspot={props.onHotspot} />
                  : <LabelHit name={hit.name} r={hit.r * d.scale} h={hit.h * d.scale} setHover={setHover} />
              )}
              {hit && <group ref={(o) => register(hit.name, o)} position={[0, hit.labelY, 0]} />}
              {/* H05：选中对象的锚点（紧凑操作条用），高度按建筑/小件区分 */}
              <group ref={(o) => register(`decor:${d.id}`, o)} position={[0, hit ? hit.labelY + 0.12 : 0.34 * Math.max(0.5, d.scale), 0]} />
            </OnCap>
          );
        })}

        <SurfaceMover az={travelerAt.az} polar={travelerAt.polar} yaw={travelerAt.yaw} reduced={reduced} speed={1.6}>
          <group scale={1.25}><Traveler pose={travelerPose} reduced={reduced} /></group>
        </SurfaceMover>
        <SurfaceMover az={lampAt.az} polar={lampAt.polar} lift={lampAt.lift} reduced={reduced} speed={1.8}>
          <StarLamp state={props.lampState} reduced={reduced} />
        </SurfaceMover>

        {sparkPts && fx && <Sparks points={sparkPts} start={fx.start} />}
      </group>

      {/* 背后的暖色天光（克制的辉光） */}
      <sprite position={[0, 0.6, -9]} scale={[22, 9, 1]}>
        <spriteMaterial map={haloTexture()} transparent opacity={0.35} depthWrite={false} color="#FFD9C2" />
      </sprite>
    </>
  );
}

function KeyLight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  const tgt = useMemo(() => { const o = new THREE.Object3D(); o.position.set(0, PLANET_R - 0.2, 0); return o; }, []);
  useEffect(() => { if (ref.current) ref.current.target = tgt; }, [tgt]);
  return (
    <>
      <primitive object={tgt} />
      <directionalLight ref={ref} color="#FFE2C2" intensity={2.5} position={[-4.5, PLANET_R + 7, 4.5]} castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-camera-near={2} shadow-camera-far={18} />
    </>
  );
}

class GLBoundary extends React.Component<{ onFail: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function GardenWorld(props: WorldProps) {
  const [hover, setHoverState] = useState<string | null>(null);
  const labelEl = useRef<HTMLDivElement>(null);
  const drag = useRef({ yaw: 0, tilt: 0 });
  const decorDrag = useRef<string | null>(null);
  const lastDecorMove = useRef(0);
  const zoom = useRef(1);
  // H02：Screen→球冠坐标函数（由内部 Scene 用相机+射线注册），供 DOM 层拖动使用
  const pointerToCap = useRef<((cx: number, cy: number) => { x: number; z: number } | null) | null>(null);
  // H05：选中对象的紧凑操作条（DOM，位置由 Scene 的投影每帧写入）
  const selEl = useRef<HTMLDivElement>(null);
  const selItem = props.selectedDecorId ? (props.decor ?? []).find((d) => d.id === props.selectedDecorId) : undefined;
  const selLabel = selItem ? (DECOR_CATALOG.find((c) => c.kind === selItem.kind)?.label ?? selItem.kind) : "";
  const press = useRef<{ x: number; y: number; yaw: number; tilt: number } | null>(null);
  // 触屏：多指跟踪。双指间距用于缩放；单指环绕仍走 press 基准
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const applyZoom = (next: number) => { zoom.current = Math.max(0.75, Math.min(2.2, next)); };
  const endPointer = (id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // 两指变一指：把剩下的手指当作新的环绕基准，避免视角跳变
      const rest = Array.from(pointers.current.values())[0];
      press.current = { x: rest.x, y: rest.y, yaw: drag.current.yaw, tilt: drag.current.tilt };
    } else {
      press.current = null;
      decorDrag.current = null;
    }
  };
  const lastAct = useRef(performance.now());
  const setHover = (k: string | null) => { setHoverState(k); document.body.style.cursor = k ? "pointer" : ""; };
  const resetView = () => { drag.current = { yaw: 0, tilt: 0 }; zoom.current = 1; };
  useEffect(() => { resetView(); props.onDragged?.(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenterKey]);
  // 「花圃定位」：点花圃标题把镜头转到该圃。yaw = -atan2(x,z) 让该圃转到画面中央，再稍微拉近。
  useEffect(() => {
    if (!props.focusBed) return;
    const { x, z } = props.focusBed;
    const yaw = -Math.atan2(x, z);
    const d = Math.hypot(x, z);
    drag.current = { yaw, tilt: Math.max(TILT_MIN, Math.min(TILT_MAX, 0.1)) };
    zoom.current = d < 0.5 ? 0.95 : 0.88;
    lastAct.current = performance.now();
    props.onDragged?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusBed?.key]);
  // 键盘：←/→ 环绕、↑/↓ 俯仰、+/- 缩放、R 复位
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (props.mode !== "garden") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const { yaw, tilt } = drag.current;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") drag.current = { yaw: yaw - 0.12, tilt };
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") drag.current = { yaw: yaw + 0.12, tilt };
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") drag.current = { yaw, tilt: Math.min(TILT_MAX, tilt + 0.08) };
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") drag.current = { yaw, tilt: Math.max(TILT_MIN, tilt - 0.08) };
      else if (e.key === "+" || e.key === "=") zoom.current = Math.max(0.75, zoom.current - 0.1);
      else if (e.key === "-" || e.key === "_") zoom.current = Math.min(2.2, zoom.current + 0.1);
      else if (e.key === "r" || e.key === "R" || e.key === "0") resetView();
      else return;
      lastAct.current = performance.now();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode]);
  // 空闲缓慢自转：3 秒无操作后开始；按下/滚轮/按键立即暂停；低动效禁用
  useEffect(() => {
    const mark = () => { lastAct.current = performance.now(); };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("wheel", mark, { passive: true });
    const t = window.setInterval(() => {
      if (props.mode !== "garden" || props.reduced || props.readOnly) return;
      if (press.current || decorDrag.current) return;
      if (performance.now() - lastAct.current < 3000) return;
      drag.current = { yaw: drag.current.yaw + 0.0035, tilt: drag.current.tilt };
    }, 100);
    return () => { window.removeEventListener("pointerdown", mark); window.removeEventListener("wheel", mark); window.clearInterval(t); };
  }, [props.mode, props.reduced, props.readOnly]);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const labelKey = hover ?? (props.selectedId ? `plant:${props.selectedId}` : null);
  const label = labelKey ? props.hoverLabel?.(labelKey) ?? null : null;

  return (
    <div className="world" style={{ position: "absolute", inset: 0, touchAction: "none" }}
      onPointerDown={(e) => {
        lastAct.current = performance.now();
        if (props.mode !== "garden" || decorDrag.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2) {
          // 双指：切到缩放，清掉单指环绕基准，否则第二指落下时视角会跳
          press.current = null;
          const [a, b] = Array.from(pointers.current.values());
          const d0 = Math.hypot(a.x - b.x, a.y - b.y);
          if (d0 > 8) pinch.current = { d0, z0: zoom.current };
          return;
        }
        press.current = { x: e.clientX, y: e.clientY, ...drag.current };
      }}
      onPointerMove={(e) => {
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pz = pinch.current;
        if (pz && pointers.current.size >= 2) {
          const [a, b] = Array.from(pointers.current.values());
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 4) {
            lastAct.current = performance.now();
            // 双指张开 → 间距变大 → 相机距离缩小 → 拉近
            applyZoom(pz.z0 * (pz.d0 / d));
          }
          return;
        }
        if (decorDrag.current) {
          // H02：拖动装饰/建筑走 DOM 层（R3F pointermove 在拖动期间不触发）
          // H11 诊断探针：记录「对象拖动」次数，与相机移动次数对照可定位相机泄漏
          if (typeof window !== "undefined") (window as any).__decorMoves = (((window as any).__decorMoves as number) ?? 0) + 1;
          const now = performance.now();
          // H11：对象拖动期间必须刷新「最近活动」时间，否则超过 3s 后空闲慢转会在拖动中接管镜头（实测相机 yaw 漂移 +0.0175）
          lastAct.current = now;
          if (now - lastDecorMove.current >= 80) {
            lastDecorMove.current = now;
            const c = pointerToCap.current?.(e.clientX, e.clientY);
            if (c) props.onDecorMove?.(decorDrag.current, c.x, c.z);
          }
          return;
        }
        const p = press.current; if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        // H11 诊断探针：相机实际被指针改动的次数
        if (typeof window !== "undefined") (window as any).__camMoves = (((window as any).__camMoves as number) ?? 0) + 1;
        lastAct.current = performance.now();
        drag.current = { yaw: p.yaw + dx * 0.005, tilt: Math.max(TILT_MIN, Math.min(TILT_MAX, p.tilt + dy * 0.0016)) };
        props.onDragged?.(Math.abs(dx) > 6 || Math.abs(dy) > 6);
      }}
      onWheel={(e) => {
        if (props.mode !== "garden") return;
        lastAct.current = performance.now();
        applyZoom(zoom.current + Math.sign(e.deltaY) * 0.07);
      }}
      onPointerUp={(e) => endPointer(e.pointerId)} onPointerCancel={(e) => endPointer(e.pointerId)}
      onPointerLeave={(e) => endPointer(e.pointerId)}>
      <GLBoundary onFail={props.onFail}>
        <Canvas shadows dpr={props.mode === "focus" ? [1, 1.25] : [1, 1.75]} camera={{ fov: 30, position: [0, 8, 8], near: 0.1, far: 60 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.shadowMap.type = THREE.PCFSoftShadowMap; if (!gl.getContext()) props.onFail(); }}
          onPointerMissed={() => setHover(null)}>
          <Suspense fallback={null}>
            <PerfProbe />
            <Scene {...props} labelEl={labelEl} selEl={selEl} hover={hover} setHover={setHover} drag={drag} zoom={zoom} decorDrag={decorDrag} lastDecorMove={lastDecorMove} pointerToCap={pointerToCap} />
          </Suspense>
        </Canvas>
      </GLBoundary>
      {props.mode === "garden" && !props.readOnly && (
        <button className="view-reset" type="button" onClick={resetView} aria-label="回到默认视角">⟲ 视角</button>
      )}
      {props.perf && <div id="perf-hud" className="perf-hud" aria-hidden="true" />}
      <div ref={labelEl} className="world-label" aria-hidden="true" style={{ opacity: 0 }}>{label}</div>
      {/* H05：选中对象的紧凑操作条——名称 + 复制/删除（位置由 Scene 的投影每帧写入，不参与 React 布局） */}
      {selItem && (
        <div ref={selEl} className="world-selbar" role="group" aria-label={`选中对象：${selLabel}`}>
          <span className="selbar-name">{selLabel}</span>
          <span className="selbar-scale">{selItem.scale.toFixed(2)}×</span>
          <button className="selbar-btn" type="button" onClick={() => props.onDecorDuplicate?.(selItem.id)} title="复制一份（Ctrl+D）">复制</button>
          <button className="selbar-btn selbar-del" type="button" onClick={() => props.onDecorRemove?.(selItem.id)} title="删除">删除</button>
        </div>
      )}
    </div>
  );
}
