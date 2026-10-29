/**
 * 花园布局：在北极“球冠”上用平面坐标 (x 向右, z 朝向镜头, 单位与星球一致) 摆放所有物体，
 * 再按等距方位投影贴回球面。布局只由花圃 / 植物的顺序决定，与数据库中的 lon/lat 无关，保证构图稳定。
 */
import * as THREE from "three";
import { PLANET_R, surfaceFrame } from "./geo";

export type WorldPlant = {
  id: string; conceptName: string; species: string; color: string; stage: "seed" | "sprout" | "leaf" | "bud" | "bloom";
  isNatal?: boolean; reviewDue?: boolean; nickname?: string | null; gardenIndex?: number;
};

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

/* ───────── 固定场景物体 ───────── */
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
};

/** 回忆小径：主花圃 → 长椅旁 → 星灯书屋门口 */
export const MEMORY_PATH: [number, number][] = [[0.08, -0.12], [0.18, -0.4], [0.36, -0.5], [0.52, -0.6], [0.66, -0.68]];
/** 去温室的小路 */
export const GREEN_PATH: [number, number][] = [[-0.22, -0.08], [-0.42, -0.3], [-0.6, -0.48], [-0.74, -0.6]];
/** 去背面观星台的星径：从温室后侧绕到背面 */
export const STAR_PATH: [number, number][] = [[-0.74, -0.6], [-1.0, -1.1], [-1.05, -1.6], [-0.92, -1.95], [-0.75, -2.15]];

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
const BED_SLOTS = [
  { x: 0, z: 0.3 }, { x: -0.98, z: 0.78 }, { x: 1.02, z: 0.86 }, { x: -1.62, z: -0.12 }, { x: 1.66, z: -0.18 },
  { x: -0.62, z: 1.28 }, { x: 0.66, z: 1.3 },
];
const HEIGHT_ORDER: Record<string, number> = { sunflower: 0, iris: 1, rose: 2, lily: 3 };

/** 8 个及以上的花圃：黄金角螺旋往外扩，保持在球冠内且不挤在一起 */
function bedSlot(i: number) {
  if (i < BED_SLOTS.length) return BED_SLOTS[i];
  const k = i - BED_SLOTS.length;
  const a = 0.7 + k * 2.399963;
  const r = Math.min(2.2, 1.25 + Math.sqrt(k) * 0.26);
  return { x: Math.sin(a) * r, z: Math.cos(a) * r };
}

export type BedLayout = {
  index: number; name: string; x: number; z: number; r: number; main: boolean;
  plants: { id: string; x: number; z: number }[];
  /** 超出单圃环位容量、未摆放的株数（分页/收起提示用，不静默丢弃） */
  overflow: number;
};

export function layoutBeds(gardens: { name: string }[], plants: WorldPlant[]): BedLayout[] {
  const n = Math.max(1, gardens.length);
  // 本命花所在的花圃放在正中（主花圃）
  const natalG = plants.find((p) => p.isNatal)?.gardenIndex ?? 0;
  const order = [natalG, ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== natalG)];
  return Array.from({ length: n }, (_, gi) => {
    const si = order.indexOf(gi);
    const slot = bedSlot(si);
    const list = plants.filter((p) => (p.gardenIndex ?? 0) === gi || (gi === 0 && (p.gardenIndex ?? -1) < 0));
    const natal = list.find((p) => p.isNatal);
    const rest = list.filter((p) => p !== natal).sort((a, b) => (HEIGHT_ORDER[a.species] ?? 2) - (HEIGHT_ORDER[b.species] ?? 2));
    const spots: { x: number; z: number }[] = [];
    if (natal) {
      const rings = [{ r: 0.25, n: 5 }, { r: 0.44, n: 9 }, { r: 0.63, n: 13 }];
      for (const ring of rings) for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + Math.PI + ring.r * 3;
        spots.push({ x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r * 0.92 });
      }
    } else if (rest.length <= 3) {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI; spots.push({ x: Math.sin(a) * 0.15, z: Math.cos(a) * 0.15 }); }
    } else {
      spots.push({ x: 0, z: 0 });
      const rings = [{ r: 0.23, n: 6 }, { r: 0.43, n: 10 }, { r: 0.63, n: 14 }];
      for (const ring of rings) for (let i = 0; i < ring.n; i++) { const a = (i / ring.n) * Math.PI * 2 + Math.PI; spots.push({ x: Math.sin(a) * ring.r, z: Math.cos(a) * ring.r }); }
    }
    // 环位容量有限：超出的株数计入 overflow，绝不产生 undefined 坐标
    const shown = rest.slice(0, spots.length);
    const overflow = rest.length - shown.length;
    const used = spots.slice(0, shown.length).sort((a, b) => a.z - b.z); // 高的种在后排
    const placed = shown.map((p, i) => ({ id: p.id, ...used[i] }));
    if (natal) placed.unshift({ id: natal.id, x: 0, z: 0.06 });
    const far = placed.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.z)), 0);
    const r = Math.max(natal ? 0.36 : 0.28, far + 0.13);
    return { index: gi, name: gardens[gi]?.name ?? "花圃", x: slot.x, z: slot.z, r, main: si === 0, plants: placed, overflow };
  });
}

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
export function scatter(beds: BedLayout[], count = 520, seed = 11, maxR = 2.35, minR = 0) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const blocked: { x: number; z: number; r: number }[] = [
    ...beds.map((b) => ({ x: b.x, z: b.z, r: b.r + 0.07 })),
    { ...SPOTS.cottage, r: 0.45 }, { ...SPOTS.greenhouse, r: 0.42 }, { ...SPOTS.bench, r: 0.16 }, { ...SPOTS.sign, r: 0.06 },
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: t.kind === "tree" ? 0.18 : 0.12 })),
    ...WILD.map((t) => ({ x: t.x, z: t.z, r: t.kind === "tree" ? 0.22 : 0.16 })),
    ...WILD_ROCKS.map((t) => ({ x: t.x, z: t.z, r: 0.12 })),
  ];
  const pathPts = [...pathCurve(MEMORY_PATH).getSpacedPoints(30), ...pathCurve(GREEN_PATH).getSpacedPoints(20)];
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
