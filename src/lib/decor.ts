"use client";
/**
 * 星球装饰：前端原型。现在存 localStorage（每台设备独立）；
 * A 的 `/api/decor` 就绪后，把 loadDecor/saveDecor 换成接口即可，其余不变。
 */
import { useEffect, useState } from "react";

export type DecorKind = "lamp" | "bush" | "tree" | "pot" | "stone" | "fence" | "chair" | "flower" | "flower2" | "flower3" | "rock" | "rose" | "soil" | "road";
/** surface 类（土壤/道路）：用 width(沿局部 x)/length(沿局部 z) 描述面积，scale 不用于放大面积 */
export type DecorPlacement = { id: string; kind: DecorKind; x: number; z: number; rot: number; scale: number; color?: string; width?: number; length?: number; stage?: string };

export const DECOR_CATALOG: { kind: DecorKind; label: string; load: number; surface?: boolean }[] = [
  { kind: "lamp", label: "路灯", load: 0.2 },
  { kind: "bush", label: "灌木", load: 0.3 },
  { kind: "tree", label: "开花小树", load: 0.8 },
  { kind: "pot", label: "花盆", load: 0.2 },
  { kind: "stone", label: "石堆", load: 0.1 },
  { kind: "fence", label: "木栅栏", load: 0.2 },
  { kind: "chair", label: "长椅", load: 0.4 },
  { kind: "flower", label: "向日葵", load: 0.3 },
  { kind: "flower2", label: "郁金香", load: 0.3 },
  { kind: "flower3", label: "雏菊", load: 0.3 },
  { kind: "rock", label: "石头", load: 0.1 },
  { kind: "rose", label: "玫瑰", load: 0.4 },
  { kind: "soil", label: "泥土/花圃地", load: 0.5, surface: true },
  { kind: "road", label: "石径", load: 0.5, surface: true },
];

/** 单星球装饰负荷上限（load 总和） */
export const DECOR_LOAD_CAP = 50;
export function loadOf(kind: DecorKind): number {
  return DECOR_CATALOG.find((c) => c.kind === kind)?.load ?? 0.2;
}
export function totalLoad(list: DecorPlacement[]): number {
  return +list.reduce((s, d) => s + loadOf(d.kind), 0).toFixed(1);
}

/** 预设落点（球冠平面坐标，避开主花圃与建筑） */
const PRESET: { x: number; z: number }[] = [
  { x: 1.95, z: 0.82 }, { x: -1.95, z: 0.9 }, { x: 2.12, z: -0.18 },
  { x: -2.1, z: -0.1 }, { x: 0.92, z: 1.95 }, { x: -0.92, z: 2.0 },
];

const KEY = "kv-decor";
const EVENT = "kv-decor";

let seq = 0;
function uid() { return `d-${Date.now().toString(36)}-${(seq++).toString(36)}`; }

export function loadDecor(): DecorPlacement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((d) => d && typeof d.x === "number" && typeof d.z === "number") : [];
  } catch { return []; }
}

export function saveDecor(list: DecorPlacement[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 隐私模式 */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
}

/** 找一个未被占用的预设落点 */
export function nextSpot(list: DecorPlacement[]) {
  const used = new Set(list.map((d) => `${Math.round(d.x * 10)}:${Math.round(d.z * 10)}`));
  for (const s of PRESET) if (!used.has(`${Math.round(s.x * 10)}:${Math.round(s.z * 10)}`)) return s;
  return PRESET[list.length % PRESET.length];
}

export function addDecor(list: DecorPlacement[], kind: DecorKind): DecorPlacement[] {
  const spot = nextSpot(list);
  return [...list, { id: uid(), kind, x: spot.x, z: spot.z, rot: 0, scale: 1 }];
}
/** 在指定球冠坐标放置（创造模式：点击球面确定） */
export function addDecorAt(list: DecorPlacement[], kind: DecorKind, x: number, z: number): DecorPlacement[] {
  const d: DecorPlacement = { id: uid(), kind, x, z, rot: 0, scale: 1 };
  if (kind === "soil" || kind === "road") { d.width = 0.7; d.length = 0.7; }
  return [...list, d];
}
export function updateDecor(list: DecorPlacement[], id: string, patch: Partial<DecorPlacement>): DecorPlacement[] {
  return list.map((d) => (d.id === id ? { ...d, ...patch } : d));
}
export function removeDecor(list: DecorPlacement[], id: string): DecorPlacement[] {
  return list.filter((d) => d.id !== id);
}

export type DecorPreset = { key: string; label: string; items: { kind: DecorKind; dx: number; dz: number; rot?: number }[] };

/** 一键布置：小范围组合，落在同一个预设点附近 */
export const DECOR_PRESETS: DecorPreset[] = [
  { key: "tea", label: "茶座", items: [
    { kind: "chair", dx: 0, dz: 0 },
    { kind: "chair", dx: 0.24, dz: -0.12, rot: 200 },
    { kind: "stone", dx: -0.16, dz: 0.18 },
  ] },
  { key: "bloom", label: "花境", items: [
    { kind: "flower", dx: -0.2, dz: 0.08 },
    { kind: "flower2", dx: 0.06, dz: 0.16 },
    { kind: "flower3", dx: 0.26, dz: 0 },
    { kind: "stone", dx: 0, dz: -0.2 },
  ] },
  { key: "lamp", label: "灯径", items: [
    { kind: "lamp", dx: -0.3, dz: 0 },
    { kind: "lamp", dx: 0.3, dz: 0 },
    { kind: "fence", dx: 0, dz: -0.26, rot: 90 },
  ] },
];

export function presetLoad(p: DecorPreset): number {
  return +p.items.reduce((s, it) => s + loadOf(it.kind), 0).toFixed(1);
}

export function addPreset(list: DecorPlacement[], p: DecorPreset): DecorPlacement[] {
  const base = nextSpot(list);
  return [...list, ...p.items.map((it) => ({ id: uid(), kind: it.kind, x: base.x + it.dx, z: base.z + it.dz, rot: it.rot ?? 0, scale: 1 }))];
}

/** 订阅装饰列表：localStorage + 自定义事件（跨组件同步） */
export function useDecor() {
  const [list, setList] = useState<DecorPlacement[]>([]);
  useEffect(() => {
    setList(loadDecor());
    const on = (e: Event) => {
      const d = (e as CustomEvent<DecorPlacement[] | undefined>).detail;
      setList(d ?? loadDecor());
    };
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  const commit = (next: DecorPlacement[]) => { saveDecor(next); setList(next); };
  return {
    decor: list,
    add: (kind: DecorKind) => commit(addDecor(list, kind)),
    place: (kind: DecorKind, x: number, z: number) => commit(addDecorAt(list, kind, x, z)),
    applyPreset: (p: DecorPreset) => commit(addPreset(list, p)),
    update: (id: string, patch: Partial<DecorPlacement>) => commit(updateDecor(list, id, patch)),
    remove: (id: string) => commit(removeDecor(list, id)),
    reset: () => commit([]),
  };
}
