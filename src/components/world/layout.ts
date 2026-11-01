/**
 * 花园布局：在北极“球冠”上用平面坐标 (x 向右, z 朝向镜头, 单位与星球一致) 摆放所有物体，
 * 再按等距方位投影贴回球面。布局只由花圃 / 植物的顺序决定，与数据库中的 lon/lat 无关，保证构图稳定。
 */
import * as THREE from "three";
import { PLANET_R, surfaceFrame } from "./geo";

import type { BedLayout } from "./bedLayout";

/** 花圃布局是纯数学，放在 `./bedLayout`，界面层也直接用它（不把 three 静态带进首屏包） */
export { layoutBeds } from "./bedLayout";
export type { BedLayout, WorldPlant } from "./bedLayout";

/** R13：世界法向量 → 球冠平面坐标（capToAzPolar 的逆），用于把切平面位移写回 x/z */
export function worldToCap(p: { x: number; y: number; z: number }) {
  const len = Math.hypot(p.x, p.y, p.z) || 1;
  const nx = p.x / len, ny = p.y / len, nz = p.z / len;
  const polar = Math.acos(Math.max(-1, Math.min(1, ny)));
  const d = polar * PLANET_R;
  const az = Math.atan2(nx, nz);
  return { x: d * Math.sin(az), z: d * Math.cos(az) };
}

export function capToAzPolar(x: number, z: number) {
  const d = Math.hypot(x, z);
  return { az: d < 1e-6 ? 0 : (Math.atan2(x, z) * 180) / Math.PI, polar: ((d / PLANET_R) * 180) / Math.PI };
}
export function capFrame(x: number, z: number, yaw = 0, lift = 0) {
  const { az, polar } = capToAzPolar(x, z);
  return surfaceFrame(az, polar, yaw, lift);
}
/** 球冠平面坐标 → 世界坐标的 xz（用于俯视绘制地表纹理） */
export function capToWorldXZ(x: number, z: number) {
  const d = Math.hypot(x, z);
  if (d < 1e-6) return { x: 0, z: 0 };
  const k = (PLANET_R * Math.sin(d / PLANET_R)) / d;
  return { x: x * k, z: z * k };
}

/* ───────── 固定场景物体 ─────────
 * 坐标：球冠平面 (x 向右, z 朝向镜头)，单位与星球半径 3 一致，d=√(x²+z²) 越大离北极越远（d≈2.3 是可见边缘）。
 * 想手动摆位置：只改这里的 x / z（yaw 是朝向角度），保存后刷新 `/space` 或 `/dev/garden` 即可；勿改数据库 lon/lat。
 */
export const SPOTS = {
  cottage: { x: 0.92, z: -0.92, yaw: -28 },
  cottageDoor: { x: 0.66, z: -0.68 },
  greenhouse: { x: -0.98, z: -0.86, yaw: 26 },
  greenhouseDoor: { x: -0.74, z: -0.6 },
  bench: { x: 0.74, z: 0.12, yaw: -32 },
  lamp: { x: 0.98, z: -0.02 },
  sign: { x: 0.42, z: 0.86, yaw: -14 },
  lampSpot: { x: 0.62, z: -0.34 },        // 星灯默认停在书屋门前（对话入口）
  observatory: { x: -0.75, z: -2.15, yaw: 18 }, // 背面观星台（环绕探索目标）
  seedShed: { x: -0.15, z: -0.95, yaw: 0 },      // 种子小棚（温室与书屋之间的后侧空地，装饰性探索目标）
  arch: { x: 0, z: 1.35, yaw: 0 },               // 花园拱门（正前入口，纯装饰）
  pond: { x: 0, z: 2.24, yaw: 0 },               // 小池塘 + 木桥（正前外缘，拱门之后的迎宾水景，装饰性探索目标）
};

/** 回忆小径：主花圃 → 长椅旁 → 星灯书屋门口 */
export const MEMORY_PATH: [number, number][] = [[0.08, -0.12], [0.18, -0.4], [0.36, -0.5], [0.52, -0.6], [0.66, -0.68]];
/** 去温室的小路 */
export const GREEN_PATH: [number, number][] = [[-0.22, -0.08], [-0.42, -0.3], [-0.6, -0.48], [-0.74, -0.6]];
/** 去背面观星台的星径：从温室后侧绕到背面 */
export const STAR_PATH: [number, number][] = [[-0.74, -0.6], [-1.0, -1.1], [-1.05, -1.6], [-0.92, -1.95], [-0.75, -2.15]];
/** 去种子小棚的小路：从温室门口向右后侧（种子小棚现位于温室与书屋之间） */
export const SEED_PATH: [number, number][] = [[-0.74, -0.6], [-0.55, -0.72], [-0.35, -0.84], [-0.15, -0.95]];

export function pathCurve(points: [number, number][]) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
}

export const TREES = [
  { x: 0.18, z: -1.62, kind: "tree", seed: 1, tint: "#EBB2BB" },
  { x: 1.75, z: -1.05, kind: "tree", seed: 2, tint: "#F2C9B6" },
  { x: -1.85, z: -0.9, kind: "tree", seed: 3, tint: "#E4A1AA" },
  { x: 1.42, z: -1.55, kind: "bush", seed: 4 }, { x: -1.45, z: -1.45, kind: "bush", seed: 5 },
  { x: 0.48, z: -1.32, kind: "bush", seed: 6 }, { x: -0.55, z: -1.28, kind: "bush", seed: 7 },
  { x: 2.05, z: 0.2, kind: "bush", seed: 8 }, { x: -2.1, z: 0.35, kind: "bush", seed: 9 },
  { x: 1.3, z: -0.4, kind: "bush", seed: 10 }, { x: -1.35, z: -0.25, kind: "bush", seed: 11 },
] as const;

/* ───────── 花圃 ───────── */
/* 花圃槽位与 ring 摆位的实现在 ./bedLayout.ts（纯函数、无 three 依赖） */

/** 外圈野生景观：绕球一圈的树丛与石头，转到侧面/背面也有景 */
type WildItem = { x: number; z: number; kind: "tree" | "bush"; seed: number; tint?: string };
export const WILD: WildItem[] = [
  ...Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.3;
    const d = 2.9 + (i % 3) * 0.32;
    return {
      x: Math.sin(a) * d, z: Math.cos(a) * d,
      kind: i % 3 === 0 ? ("tree" as const) : ("bush" as const),
      seed: 31 + i,
      tint: ["#EBB2BB", "#F2C9B6", "#E4A1AA"][i % 3],
    };
  }),
  // 背面中纬度的几丛，避免转到背后只有草
  { x: 1.54, z: -1.84, kind: "tree", seed: 71, tint: "#EBB2BB" },
  { x: 0.65, z: -2.42, kind: "bush", seed: 72 },
  { x: -0.82, z: -2.26, kind: "tree", seed: 73, tint: "#E4A1AA" },
  { x: -1.77, z: -1.77, kind: "bush", seed: 74 },
];
export const WILD_ROCKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 + 0.9;
  const d = 3.1 + (i % 2) * 0.4;
  return { x: Math.sin(a) * d, z: Math.cos(a) * d, seed: 51 + i };
});

/** 草丛与小石头：避开花圃、建筑与小路；可指定环带（minR/maxR）铺满整个可见球面 */
export function scatter(beds: BedLayout[], count = 520, seed = 11, maxR = 2.35, minR = 0, obstacles?: { blocked: {x:number;z:number;r:number}[]; paths: {x:number;z:number}[] }) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const blocked: { x: number; z: number; r: number }[] = [
    ...beds.map((b) => ({ x: b.x, z: b.z, r: b.r + 0.07 })),
    ...(obstacles?.blocked ?? [
    { ...SPOTS.cottage, r: 0.45 }, { ...SPOTS.greenhouse, r: 0.42 }, { ...SPOTS.bench, r: 0.16 }, { ...SPOTS.sign, r: 0.06 },
    { ...SPOTS.seedShed, r: 0.34 }, { ...SPOTS.arch, r: 0.16 }, { ...SPOTS.pond, r: 0.52 },
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: t.kind === "tree" ? 0.18 : 0.12 })),
    ...WILD.map((t) => ({ x: t.x, z: t.z, r: t.kind === "tree" ? 0.22 : 0.16 })),
    ...WILD_ROCKS.map((t) => ({ x: t.x, z: t.z, r: 0.12 })),
    ]),
  ];
  const pathPts = obstacles?.paths ?? [...pathCurve(MEMORY_PATH).getSpacedPoints(30), ...pathCurve(GREEN_PATH).getSpacedPoints(20), ...pathCurve(STAR_PATH).getSpacedPoints(20), ...pathCurve(SEED_PATH).getSpacedPoints(12)];
  const out: { x: number; z: number; s: number; tone: number; yaw: number }[] = [];
  let guard = 0;
  const ring = maxR * maxR - minR * minR;
  while (out.length < count && guard++ < count * 8) {
    const r = Math.sqrt(rnd() * ring + minR * minR), a = rnd() * Math.PI * 2;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (blocked.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) continue;
    if (pathPts.some((p) => Math.hypot(x - p.x, z - p.z) < 0.09)) continue;
    out.push({ x, z, s: 0.7 + rnd() * 0.8, tone: Math.floor(rnd() * 4), yaw: rnd() * Math.PI * 2 });
  }
  return out;
}
