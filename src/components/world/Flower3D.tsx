"use client";
/**
 * 3D 绘本花朵：玫瑰（层叠花瓣）、向日葵（花盘 + 环形花瓣）、铃兰（弯茎 + 下垂铃铛）、鸢尾（旗瓣 + 垂瓣）。
 * 五个阶段使用不同的模型：种子（土丘与种子）→ 嫩芽（子叶）→ 生叶（茎与真叶）→ 花苞 → 开花；open 控制花瓣展开。
 * 尺寸单位与星球一致（星球半径 3）。所有变化由 seed 决定，同一株每次相同。
 */
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { colorOf, type StageKey } from "@/lib/flora";
import { C, matte, vcol, petalGeo, leafGeo, stemGeo, stemCurvePoint, bellGeo, sphereGeo, seedDiskTexture, contactGeo, contactMat, torusGeo, rand, cylGeo } from "./geo";

type P = { species: string; color: string; stage: StageKey; open?: number; seed?: number; selected?: boolean; hovered?: boolean; reduced?: boolean; scale?: number; hideContact?: boolean };

const HEIGHT: Record<string, number> = { rose: 0.3, sunflower: 0.36, iris: 0.3, lily: 0.2 };

function Petal({ geo, az, tilt, r = 0, y = 0, tw = 0 }: { geo: THREE.BufferGeometry; az: number; tilt: number; r?: number; y?: number; tw?: number }) {
  return (
    <group rotation={[0, az, 0]}>
      <mesh geometry={geo} material={vcol("petal")} position={[0, y, r]} rotation={[tilt, 0, tw]} castShadow />
    </group>
  );
}

type PetalSpec = { geo: THREE.BufferGeometry; az: number; tilt: number; r?: number; y?: number; tw?: number };

/** 把多片花瓣合并成一个 mesh，减少 draw calls（每片花瓣原来是独立 mesh） */
function MergedPetals({ specs, deps }: { specs: PetalSpec[]; deps: string }) {
  const merged = useMemo(() => {
    const parts = specs.map((p) => {
      const outer = new THREE.Matrix4().makeRotationY(p.az);
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt, 0, p.tw ?? 0, "XYZ"));
      const inner = new THREE.Matrix4().compose(new THREE.Vector3(0, p.y ?? 0, p.r ?? 0), rot, new THREE.Vector3(1, 1, 1));
      return p.geo.clone().applyMatrix4(outer.multiply(inner));
    });
    return mergeGeometries(parts, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);
  return <mesh geometry={merged} material={vcol("petal")} castShadow />;
}

type LeafSpec = { kind: string; len: number; w: number; at: [number, number, number]; yaw: number; tilt: number; bend?: number };

/** 多片叶子合并成一个 mesh（同材质、同顶点色），每株从 2–6 次 draw 降到 1 次 */
function MergedLeaves({ specs, deps }: { specs: LeafSpec[]; deps: string }) {
  const merged = useMemo(() => {
    const parts = specs.map((s) => {
      const m = new THREE.Matrix4()
        .multiply(new THREE.Matrix4().makeTranslation(s.at[0], s.at[1], s.at[2]))
        .multiply(new THREE.Matrix4().makeRotationY(s.yaw))
        .multiply(new THREE.Matrix4().makeRotationX(s.tilt));
      return leafGeo(s.kind as any, s.len, s.w, s.bend ?? 0.25).clone().applyMatrix4(m);
    });
    return mergeGeometries(parts, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);
  return <mesh geometry={merged} material={vcol("leaf")} castShadow />;
}

function mid(a: string, b: string) { return "#" + new THREE.Color(a).lerp(new THREE.Color(b), 0.55).getHexString(); }



function RoseHead({ c, open, bud }: { c: ReturnType<typeof colorOf>; open: number; bud: boolean }) {
  const k = bud ? 0 : open;
  const base = mid(c.deep, c.petal);
  const inner = petalGeo({ len: 0.044, width: 0.052, cup: 1.4, curl: 0.0, base: c.deep, mid: base, tip: c.petal });
  const r1 = petalGeo({ len: 0.058, width: 0.072, cup: 1.18, curl: -0.04, base, mid: c.petal, tip: c.light });
  const r2 = petalGeo({ len: 0.07, width: 0.086, cup: 0.96, curl: -0.1, base, mid: c.petal, tip: c.light });
  const r3 = petalGeo({ len: 0.078, width: 0.094, cup: 0.74, curl: -0.16, base, mid: c.petal, tip: c.light, round: 0.66 });
  const sep = leafGeo("almond", 0.05, 0.016, 0.4);
  const budP = petalGeo({ len: 0.058, width: 0.046, cup: 2.4, curl: 0.035, base: c.deep, mid: c.petal, tip: c.light, round: 0.82 });
  if (bud) {
    return (
      <group>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={`s${i}`} rotation={[0, (i / 5) * Math.PI * 2 + 0.3, 0]}>
            <mesh geometry={sep} material={vcol("leaf")} rotation={[0.3, 0, 0]} castShadow />
          </group>
        ))}
        <mesh geometry={sphereGeo(0.018, 12, 9)} material={matte(C.leafDeep)} position={[0, 0.012, 0]} scale={[1, 0.85, 1]} castShadow />
        <MergedPetals specs={[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ geo: budP, az: (i / 8) * Math.PI * 2 + i * 0.09, tilt: 0.07, r: 0.007, tw: 0.12 }))} deps={`bud-${c.petal}`} />
      </group>
    );
  }
  return (
    <group rotation={[0.28, 0, 0]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={`s${i}`} rotation={[0, (i / 5) * Math.PI * 2 + 0.3, 0]}>
          <mesh geometry={sep} material={vcol("leaf")} rotation={[bud ? 0.35 : 1.9, 0, 0]} castShadow />
        </group>
      ))}
      <MergedPetals
        specs={[
          ...[0, 1, 2].map((i) => ({ geo: inner, az: (i / 3) * Math.PI * 2, tilt: 0.04 + k * 0.05, r: 0.004 })),
          ...[0, 1, 2, 3, 4].map((i) => ({ geo: r1, az: (i / 5) * Math.PI * 2 + 0.6, tilt: 0.16 + k * 0.16, r: 0.009 })),
          ...[0, 1, 2, 3, 4, 5].map((i) => ({ geo: r2, az: (i / 6) * Math.PI * 2 + 0.25, tilt: 0.32 + k * 0.32, r: 0.015, y: -0.006 })),
          ...(k > 0.35 ? [0, 1, 2, 3, 4, 5, 6].map((i) => ({ geo: r3, az: (i / 7) * Math.PI * 2, tilt: 0.6 + k * 0.4, r: 0.02, y: -0.012 })) : []),
        ]}
        deps={`${Math.round(k * 20)}-${c.petal}`}
      />
    </group>
  );
}

function SunflowerHead({ c, open, bud }: { c: ReturnType<typeof colorOf>; open: number; bud: boolean }) {
  const disk = useMemo(() => new THREE.MeshStandardMaterial({ map: seedDiskTexture(), roughness: 0.95 }), []);
  const ray = petalGeo({ len: 0.07, width: 0.024, cup: 0.35, curl: 0.04, base: c.deep, mid: c.petal, tip: c.light, round: 0.8 });
  const ray2 = petalGeo({ len: 0.062, width: 0.022, cup: 0.3, curl: 0.06, base: c.deep, mid: c.deep, tip: c.petal, round: 0.8 });
  const bract = leafGeo("almond", 0.03, 0.016, 0.1);
  if (bud) {
    return (
      <group>
        <mesh geometry={sphereGeo(0.032, 14, 10)} material={matte(C.leafDeep)} scale={[1, 0.8, 1]} castShadow />
        {Array.from({ length: 10 }, (_, i) => (
          <group key={i} rotation={[0, (i / 10) * Math.PI * 2, 0]}><mesh geometry={bract} material={vcol("leaf")} position={[0, -0.01, 0.02]} rotation={[0.6, 0, 0]} /></group>
        ))}
      </group>
    );
  }
  const spread = 1.05 + open * 0.42;
  return (
    <group rotation={[0.95, 0, 0]}>
      <MergedPetals
        specs={[
          ...Array.from({ length: 14 }, (_, i) => ({ geo: ray2, az: (i / 14) * Math.PI * 2 + 0.22, tilt: spread + 0.06, r: 0.036, y: -0.004 })),
          ...Array.from({ length: 16 }, (_, i) => ({ geo: ray, az: (i / 16) * Math.PI * 2, tilt: spread, r: 0.04 })),
        ]}
        deps={`${Math.round(spread * 20)}-${c.petal}`}
      />
      <mesh geometry={cylGeo(0.046, 0.04, 0.016, 24)} material={matte("#5A3B22")} position={[0, 0.002, 0]} />
      <mesh material={disk} position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.046, 28]} /></mesh>
    </group>
  );
}

function IrisHead({ c, open, bud }: { c: ReturnType<typeof colorOf>; open: number; bud: boolean }) {
  if (bud) {
    return (
      <group>
        <mesh geometry={sphereGeo(0.018, 10, 8)} material={matte(c.petal)} scale={[0.8, 2.6, 0.8]} position={[0, 0.03, 0]} castShadow />
        <mesh geometry={leafGeo("sword", 0.06, 0.02, 0.05)} material={vcol("leaf")} rotation={[0.12, 0, 0]} />
      </group>
    );
  }
  const std = petalGeo({ len: 0.075, width: 0.05, cup: 0.6, curl: -0.22, base: mid(c.deep, c.petal), mid: c.petal, tip: c.light, round: 0.5 });
  const fall = petalGeo({ len: 0.085, width: 0.058, cup: 0.35, curl: 0.55, base: mid(c.deep, c.petal), mid: c.petal, tip: c.light, stripe: C.honey, round: 0.5 });
  return (
    <group>
      <MergedPetals
        specs={[
          ...[0, 1, 2].map((i) => ({ geo: std, az: (i / 3) * Math.PI * 2, tilt: 0.28 + open * 0.16, r: 0.006 })),
          ...[0, 1, 2].map((i) => ({ geo: fall, az: (i / 3) * Math.PI * 2 + Math.PI / 3, tilt: 0.7 + open * 0.75, r: 0.008 })),
        ]}
        deps={`${Math.round(open * 20)}-${c.petal}`}
      />
    </group>
  );
}

function LilySpray({ c, open, bud, seed }: { c: ReturnType<typeof colorOf>; open: number; bud: boolean; seed: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.006, 0.12, 0), new THREE.Vector3(0.035, 0.2, 0.01), new THREE.Vector3(0.085, 0.19, 0.02), new THREE.Vector3(0.11, 0.155, 0.02)]), []);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 20, 0.0035, 6, false), [curve]);
  const bellMat = useMemo(() => new THREE.MeshStandardMaterial({ color: c.light, roughness: 0.7, side: THREE.DoubleSide }), [c.light]);
  const n = bud ? 4 : 6;
  return (
    <group rotation={[0, rand(seed, 3) * Math.PI * 2, 0]}>
      <mesh geometry={tube} material={matte(C.stem)} castShadow />
      {Array.from({ length: n }, (_, i) => {
        const t = 0.45 + (i / (n - 1)) * 0.53;
        const p = curve.getPoint(t);
        const s = (bud ? 0.6 : 0.9 + 0.5 * open) * (1.1 - (i / n) * 0.45);
        return (
          <group key={i} position={p}>
            <mesh geometry={cylGeo(0.0018, 0.0018, 0.018, 4)} material={matte(C.stem)} position={[0, -0.009, 0]} />
            <mesh geometry={bellGeo()} material={bud ? matte(C.leafLight) : bellMat} position={[0, -0.016, 0]} scale={s} castShadow />
          </group>
        );
      })}
    </group>
  );
}

export function Flower3D({ species, color, stage, open = 1, seed = 1, selected, hovered, reduced, scale = 1, hideContact = false }: P) {
  const c = colorOf(color);
  const root = useRef<THREE.Group>(null);
  const bend = (rand(seed, 1) - 0.5) * 0.05;
  const yaw = (rand(seed, 2) - 0.5) * 1.1; // 花朵朝向镜头附近，保证最佳观赏面
  const vary = 0.92 + rand(seed, 4) * 0.16;
  const H = HEIGHT[species] ?? 0.3;
  const sel = useRef(0);

  useFrame((st, dt) => {
    const g = root.current; if (!g) return;
    const t = st.clock.elapsedTime;
    sel.current += ((selected ? 1 : hovered ? 0.5 : 0) - sel.current) * Math.min(1, dt * 6);
    if (!reduced) {
      g.rotation.z = Math.sin(t * 1.1 + seed) * 0.035;
      g.rotation.x = Math.sin(t * 0.8 + seed * 2) * 0.02;
    }
    const s = scale * vary * (1 + sel.current * 0.06 + (selected && !reduced ? Math.sin(t * 3) * 0.008 : 0));
    g.scale.setScalar(s);
  });

  const body = useMemo(() => {
    if (stage === "seed") {
      return (
        <group>
          <mesh geometry={sphereGeo(0.036, 16, 10)} material={matte(C.soil)} scale={[1, 0.38, 1]} position={[0, 0.004, 0]} receiveShadow />
          <mesh geometry={sphereGeo(0.016, 12, 8)} material={matte("#C9A16E")} scale={[1, 0.7, 1.4]} position={[0.005, 0.02, 0]} rotation={[0, 0.5, 0.4]} castShadow />
          <mesh geometry={sphereGeo(0.006, 8, 6)} material={matte("#F3DFA9")} position={[0.008, 0.028, 0.008]} />
        </group>
      );
    }
    if (stage === "sprout") {
      return (
        <group>
          <mesh geometry={sphereGeo(0.034, 16, 10)} material={matte(C.soil)} scale={[1, 0.3, 1]} receiveShadow />
          <mesh geometry={stemGeo(0.07, bend * 0.6, 0.008)} material={matte(C.stem)} castShadow />
          <MergedLeaves deps="sprout" specs={[
            { kind: "round", len: 0.04, w: 0.034, at: stemCurvePoint(0.07, bend * 0.6, 1).toArray(), yaw: 0, tilt: 1.15, bend: 0.15 },
            { kind: "round", len: 0.04, w: 0.034, at: stemCurvePoint(0.07, bend * 0.6, 1).toArray(), yaw: Math.PI, tilt: 1.15, bend: 0.15 },
          ]} />
        </group>
      );
    }
    const h = stage === "leaf" ? H * 0.55 : stage === "bud" ? H * 0.82 : H;
    const top = stemCurvePoint(h, bend, 1);
    const leaves: LeafSpec[] = [];
    if (species === "iris") {
      for (let i = 0; i < 4; i++) leaves.push({ kind: "sword", len: h * (0.75 + 0.15 * (i % 2)), w: 0.026, at: [0, 0, 0], yaw: (i / 4) * Math.PI * 2 + 0.4, tilt: 0.18 + (i % 2) * 0.12, bend: 0.08 });
    } else if (species === "lily") {
      leaves.push({ kind: "broad", len: 0.15, w: 0.06, at: [0, 0, 0], yaw: 0.4, tilt: 0.22, bend: 0.2 });
      leaves.push({ kind: "broad", len: 0.13, w: 0.055, at: [0, 0, 0], yaw: 0.4 + Math.PI, tilt: 0.28, bend: 0.22 });
    } else {
      const n = stage === "leaf" ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const t = 0.25 + (i / n) * 0.55;
        leaves.push({ kind: species === "sunflower" ? "heart" : "almond", len: species === "sunflower" ? 0.085 : 0.058, w: species === "sunflower" ? 0.068 : 0.036,
          at: stemCurvePoint(h, bend, t).toArray(), yaw: i * 2.4, tilt: 1.05, bend: 0.3 });
      }
    }
    if (species !== "lily" && stage === "leaf") leaves.push({ kind: "almond", len: 0.03, w: 0.018, at: top.toArray(), yaw: 0.5, tilt: 0.3 });
    return (
      <group>
        <mesh geometry={sphereGeo(0.032, 14, 8)} material={matte(C.soilDeep)} scale={[1, 0.22, 1]} receiveShadow />
        {species !== "lily" && <mesh geometry={stemGeo(h, bend, species === "sunflower" ? 0.011 : 0.007)} material={matte(C.stem)} castShadow />}
        {leaves.length > 0 && <MergedLeaves specs={leaves} deps={`${species}-${stage}-${seed}`} />}
        {species === "lily" && stage !== "leaf" && <LilySpray c={c} open={open} bud={stage === "bud"} seed={seed} />}
        {species === "lily" && stage === "leaf" && <mesh geometry={stemGeo(0.09, 0.01, 0.006)} material={matte(C.stem)} />}
        {species !== "lily" && (stage === "bud" || stage === "bloom") && (
          <group position={top}>
            {species === "rose" && <RoseHead c={c} open={open} bud={stage === "bud"} />}
            {species === "sunflower" && <SunflowerHead c={c} open={open} bud={stage === "bud"} />}
            {species === "iris" && <IrisHead c={c} open={open} bud={stage === "bud"} />}
          </group>
        )}
      </group>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, color, stage, Math.round(open * 20), seed]);

  return (
    <group>
      {!hideContact && <mesh geometry={contactGeo()} material={contactMat()} scale={stage === "bloom" ? 0.11 : 0.08} position={[0, 0.002, 0]} />}
      {(selected || hovered) && <mesh geometry={torusGeo(0.11, 0.004, 6, 40)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={matte(C.honey, { emissive: C.honey, emissiveIntensity: selected ? 0.9 : 0.4 })} />}
      <group ref={root} rotation={[0, yaw, 0]}>{body}</group>
    </group>
  );
}
