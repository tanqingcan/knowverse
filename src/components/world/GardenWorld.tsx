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
import { C, matte, PLANET_R, haloTexture, sphereGeo, cylGeo, bladeGeo, rand } from "./geo";
import { Flower3D } from "./Flower3D";
import { Bench, BlossomTree, Bush, CloudRing, Cottage, DistantPlanet, GardenBed, Greenhouse, Lamp, Sign, SteppingStone } from "./Props3D";
import { StarLamp, SurfaceMover, Traveler, type Pose } from "./Characters3D";
import { capFrame, capToAzPolar, layoutBeds, MEMORY_PATH, GREEN_PATH, pathCurve, scatter, SPOTS, TREES, type BedLayout, type WorldPlant } from "./layout";
import { paintTerrain, planetGeometry } from "./terrain";
import type { StageKey } from "@/lib/flora";

export type Hotspot = "cottage" | "greenhouse" | "path" | "galaxy";
export type Celebration = { plantId: string; fromStage: StageKey; toStage: StageKey; key: number } | null;

export type WorldProps = {
  plants: WorldPlant[]; gardens: { name: string }[];
  selectedId?: string | null; onSelect?: (id: string) => void; onHotspot?: (h: Hotspot) => void;
  mode: "garden" | "focus"; reduced: boolean; celebrate?: Celebration; onGrowthShown?: (c: NonNullable<Celebration>) => void;
  pose: Pose; lampState: "idle" | "think" | "celebrate" | "guide";
  signText: string; signSub?: string; recenterKey: number; onDragged?: (b: boolean) => void;
  hoverLabel?: (key: string) => string | null; intro?: "long" | "short" | "none"; onIntroDone?: () => void;
  onFail: () => void;
};

const ELEV = (38 * Math.PI) / 180;
const EYE_DIR = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
const LOOK = new THREE.Vector3(0, PLANET_R - 0.12, 0.02);

const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

/* ───────── 花圃里的一株植物（含成长动画） ───────── */
function PlantNode({ p, x, z, k = 1, selected, hovered, reduced, fx, onSelect, setHover, register }: {
  p: WorldPlant; x: number; z: number; k?: number; selected: boolean; hovered: boolean; reduced: boolean;
  fx: { from: StageKey; to: StageKey; start: number } | null;
  onSelect?: (id: string) => void; setHover: (k: string | null) => void; register: (k: string, o: THREE.Object3D | null) => void;
}) {
  const g = useRef<THREE.Group>(null);
  const [phase, setPhase] = useState<"before" | "after">("after");
  const [open, setOpen] = useState(1);
  const lastOpen = useRef(1);
  useEffect(() => { if (fx && !reduced) { setPhase("before"); setOpen(fx.to === "bloom" ? 0.08 : 1); } else { setPhase("after"); setOpen(1); } }, [fx, reduced]);
  useFrame(() => {
    if (!fx || reduced || !g.current) { if (g.current) g.current.scale.setScalar(1); return; }
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
        <Flower3D species={p.species} color={p.color} stage={stage} open={open} seed={(hashId(p.id) % 97) + 1} selected={selected} hovered={hovered} reduced={reduced} scale={scale} />
      </group>
      {p.reviewDue && <mesh geometry={sphereGeo(0.012, 10, 8)} material={matte("#F4DFA6", { emissive: "#F4DFA6", emissiveIntensity: 0.8 })} position={[0.07, 0.03, 0.04]} />}
      <group ref={(o) => register(`plant:${p.id}`, o)} position={[0, (p.stage === "bloom" || p.stage === "bud" ? 0.42 : 0.2) * (scale / 1.22) * 0.8, 0]} />
      <mesh geometry={cylGeo(0.1, 0.1, 0.55, 8)} material={hitMat} position={[0, 0.26, 0]}
        onPointerOver={(e) => { e.stopPropagation(); setHover(`plant:${p.id}`); }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onSelect?.(p.id); }} />
    </group>
  );
}
function hashId(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }

function Bed({ bed, plants, ...rest }: { bed: BedLayout; plants: Map<string, WorldPlant> } & Omit<React.ComponentProps<typeof PlantNode>, "p" | "x" | "z" | "selected" | "hovered" | "fx"> & { selectedId?: string | null; hover: string | null; fx: { id: string; from: StageKey; to: StageKey; start: number } | null }) {
  const f = useMemo(() => capFrame(bed.x, bed.z), [bed.x, bed.z]);
  const { selectedId, hover, fx, ...pass } = rest as any;
  return (
    <group position={f.pos} quaternion={f.quat}>
      <mesh geometry={cylGeo(bed.r * 1.05, bed.r * 1.08, 0.12, 40)} material={matte(C.soilDeep)} position={[0, -0.05, 0]} />
      <GardenBed r={bed.r} />
      {bed.plants.map((pp) => {
        const p = plants.get(pp.id); if (!p) return null;
        return <PlantNode key={pp.id} p={p} x={pp.x} z={pp.z} k={bed.main ? 1 : 0.8} selected={selectedId === p.id} hovered={hover === `plant:${p.id}`}
          fx={fx && fx.id === p.id ? fx : null} {...pass} />;
      })}
    </group>
  );
}

/* ───────── 地表上的物体 ───────── */
function OnCap({ x, z, yaw = 0, lift = 0, children }: { x: number; z: number; yaw?: number; lift?: number; children: React.ReactNode }) {
  const f = useMemo(() => capFrame(x, z, yaw, lift), [x, z, yaw, lift]);
  return <group position={f.pos} quaternion={f.quat}>{children}</group>;
}

function Grass({ items }: { items: ReturnType<typeof scatter> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    // 圆润的草丛：几片宽而短、略向外弯的叶片
    const parts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.028 + (i % 3) * 0.008;
      const b = bladeGeo(h, 0.007).clone().rotateZ((i - 2) * 0.28).rotateY(i * 1.3).translate(Math.sin(i * 1.3) * 0.006, 0, Math.cos(i * 1.3) * 0.006).toNonIndexed();
      parts.push(...(b.attributes.position.array as Float32Array));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(parts, 3)); g.computeVertexNormals();
    return g;
  }, []);
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

/** 前景低云：裹住星球前缘，缩小下半球在画面中的占比 */
function FrontClouds() {
  const puffs = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const x = -2.7 + (i / 15) * 5.4 + (rand(i, 1) - 0.5) * 0.3;
    const z = 1.78 - Math.abs(x) * 0.12 + rand(i, 2) * 0.22;
    return { x, z, s: 0.28 + rand(i, 3) * 0.22, lift: 0.02 + rand(i, 4) * 0.06, c: i % 5 === 0 ? "#F7DCCF" : i % 3 === 0 ? "#EFE6F3" : "#FFF7EE" };
  }), []);
  return <>{puffs.map((p, i) => <OnCap key={i} x={p.x} z={p.z} lift={p.lift}><mesh geometry={sphereGeo(1, 18, 12)} material={matte(p.c, { rough: 1 })} scale={[p.s * 1.4, p.s * 0.7, p.s]} /></OnCap>)}</>;
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
function MemoryPath({ setHover, onHotspot }: { setHover: (k: string | null) => void; onHotspot?: (h: Hotspot) => void }) {
  const stones = useMemo(() => pathCurve(MEMORY_PATH).getSpacedPoints(9).slice(1, -1).map((v, i) => ({ x: v.x + (i % 2 ? 0.025 : -0.02), z: v.z, s: 0.85 + rand(i, 7) * 0.4, i })), []);
  const g2 = useMemo(() => pathCurve(GREEN_PATH).getSpacedPoints(6).slice(1, -1).map((v, i) => ({ x: v.x, z: v.z, s: 0.7 + rand(i, 9) * 0.3, i: i + 20 })), []);
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
function Rig({ mode, reduced, focusPoint, drag, intro, onIntroDone, worldRef }: {
  mode: "garden" | "focus"; reduced: boolean; focusPoint: THREE.Vector3 | null;
  drag: React.MutableRefObject<{ yaw: number; tilt: number }>; intro: "long" | "short" | "none"; onIntroDone?: () => void;
  worldRef: React.RefObject<THREE.Group | null>;
}) {
  const { camera, size } = useThree();
  const acc = useRef(0);
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
    const wantD = d * (1 + (1 - e) * 1.1);
    const k = reduced || dist.current === 0 ? 1 : done.current ? Math.min(1, dt * 3) : 1;
    dist.current += (wantD - dist.current) * k;
    look.current.lerp(tgt, k);
    cam.position.copy(look.current).addScaledVector(dir, dist.current);
    cam.lookAt(look.current);
    // 拖动（有限范围）
    const kd = reduced ? 1 : Math.min(1, dt * 6);
    cur.current.yaw += (drag.current.yaw - cur.current.yaw) * kd;
    cur.current.tilt += (drag.current.tilt - cur.current.tilt) * kd;
    if (worldRef.current) { worldRef.current.rotation.y = cur.current.yaw; worldRef.current.rotation.x = cur.current.tilt; }
  });
  return null;
}

/** 悬停 / 选中标签：每帧把锚点投影到屏幕，直接写 DOM，不触发 React 渲染 */
function LabelTracker({ anchors, labelKey, el }: { anchors: React.MutableRefObject<Map<string, THREE.Object3D>>; labelKey: string | null; el: React.RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const d = el.current; if (!d) return;
    const o = labelKey ? anchors.current.get(labelKey) : null;
    if (!o) { d.style.opacity = "0"; return; }
    o.getWorldPosition(v); v.project(camera);
    d.style.opacity = "1";
    d.style.transform = `translate(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, -100%)`;
  });
  return null;
}

function Scene(props: WorldProps & { labelEl: React.RefObject<HTMLDivElement | null>; hover: string | null; setHover: (k: string | null) => void; drag: React.MutableRefObject<{ yaw: number; tilt: number }> }) {
  const { plants, gardens, selectedId, reduced, celebrate, hover, setHover } = props;
  const world = useRef<THREE.Group>(null);
  const anchors = useRef(new Map<string, THREE.Object3D>());
  const register = useMemo(() => (k: string, o: THREE.Object3D | null) => { if (o) anchors.current.set(k, o); else anchors.current.delete(k); }, []);
  const beds = useMemo(() => layoutBeds(gardens, plants), [gardens, plants]);
  const plantMap = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  const grass = useMemo(() => scatter(beds, 380), [beds]);
  const blooms = useMemo(() => scatter(beds, 140, 29), [beds]);
  const terrain = useMemo(() => paintTerrain(beds), [beds]);
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
      <Rig mode={props.mode} reduced={reduced} focusPoint={focusPoint} drag={props.drag} intro={props.intro ?? "none"} worldRef={world}
        onIntroDone={() => { setIntroDone(true); props.onIntroDone?.(); }} />
      <LabelTracker anchors={anchors} labelKey={hover ?? (selectedId ? `plant:${selectedId}` : null)} el={props.labelEl} />

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

      <group ref={world}>
        <mesh geometry={planetGeo} material={planetMat} receiveShadow />
        <CloudRing R={PLANET_R} />
        <Grass items={grass} />
        <Wildflowers items={blooms} />

        {beds.map((b) => (
          <Bed key={b.index} bed={b} plants={plantMap} selectedId={selectedId} hover={hover} fx={fx}
            reduced={reduced} onSelect={props.onSelect} setHover={setHover} register={register} />
        ))}

        <OnCap x={SPOTS.cottage.x} z={SPOTS.cottage.z} yaw={SPOTS.cottage.yaw}>
          <group scale={0.86}><Cottage lights={L} /></group>
          <group ref={(o) => register("cottage", o)} position={[0, 0.95, 0]} />
          <Hit name="cottage" r={0.34} h={0.9} setHover={setHover} onHotspot={props.onHotspot} />
        </OnCap>
        <OnCap x={SPOTS.greenhouse.x} z={SPOTS.greenhouse.z} yaw={SPOTS.greenhouse.yaw}>
          <Greenhouse lights={L} />
          <group ref={(o) => register("greenhouse", o)} position={[0, 0.48, 0]} />
          <Hit name="greenhouse" r={0.32} h={0.45} setHover={setHover} onHotspot={props.onHotspot} />
        </OnCap>
        <MemoryPath setHover={setHover} onHotspot={props.onHotspot} />
        <OnCap x={0.38} z={-0.48}><group ref={(o) => register("path", o)} position={[0, 0.12, 0]} /></OnCap>
        <OnCap x={SPOTS.bench.x} z={SPOTS.bench.z} yaw={SPOTS.bench.yaw}><Bench /></OnCap>
        <OnCap x={SPOTS.lamp.x} z={SPOTS.lamp.z}><Lamp lights={L} /></OnCap>
        <OnCap x={SPOTS.sign.x} z={SPOTS.sign.z} yaw={SPOTS.sign.yaw}><group scale={1.5}><Sign text={props.signText} sub={props.signSub} w={0.24} h={0.11} post={0.1} /></group></OnCap>
        {TREES.map((t, i) => (
          <OnCap key={i} x={t.x} z={t.z}>{t.kind === "tree" ? <BlossomTree seed={t.seed} blossom={(t as any).tint} /> : <Bush seed={t.seed} />}</OnCap>
        ))}

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
  const press = useRef<{ x: number; y: number; yaw: number; tilt: number } | null>(null);
  const setHover = (k: string | null) => { setHoverState(k); document.body.style.cursor = k ? "pointer" : ""; };
  useEffect(() => { drag.current = { yaw: 0, tilt: 0 }; props.onDragged?.(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenterKey]);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const labelKey = hover ?? (props.selectedId ? `plant:${props.selectedId}` : null);
  const label = labelKey ? props.hoverLabel?.(labelKey) ?? null : null;

  return (
    <div className="world" style={{ position: "absolute", inset: 0, touchAction: "pan-y" }}
      onPointerDown={(e) => { if (props.mode !== "garden") return; press.current = { x: e.clientX, y: e.clientY, ...drag.current }; }}
      onPointerMove={(e) => {
        const p = press.current; if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        drag.current = { yaw: Math.max(-0.6, Math.min(0.6, p.yaw + dx * 0.004)), tilt: Math.max(-0.08, Math.min(0.12, p.tilt + dy * 0.0012)) };
        props.onDragged?.(Math.abs(drag.current.yaw) > 0.05 || Math.abs(drag.current.tilt) > 0.03);
      }}
      onPointerUp={() => { press.current = null; }} onPointerLeave={() => { press.current = null; }}>
      <GLBoundary onFail={props.onFail}>
        <Canvas shadows dpr={props.mode === "focus" ? [1, 1.25] : [1, 1.75]} camera={{ fov: 30, position: [0, 8, 8], near: 0.1, far: 60 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.shadowMap.type = THREE.PCFSoftShadowMap; if (!gl.getContext()) props.onFail(); }}
          onPointerMissed={() => setHover(null)}>
          <Suspense fallback={null}>
            <Scene {...props} labelEl={labelEl} hover={hover} setHover={setHover} drag={drag} />
          </Suspense>
        </Canvas>
      </GLBoundary>
      <div ref={labelEl} className="world-label" aria-hidden="true" style={{ opacity: 0 }}>{label}</div>
    </div>
  );
}
