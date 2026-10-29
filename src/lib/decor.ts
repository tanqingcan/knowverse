"use client";
/**
 * 星球装饰：前端原型。现在存 localStorage（每台设备独立）；
 * A 的 `/api/decor` 就绪后，把 loadDecor/saveDecor 换成接口即可，其余不变。
 */
import { useEffect, useState } from "react";

export type DecorKind = "lamp" | "bush" | "tree";
export type DecorPlacement = { id: string; kind: DecorKind; x: number; z: number; rot: number; scale: number };

export const DECOR_CATALOG: { kind: DecorKind; label: string; load: number }[] = [
  { kind: "lamp", label: "路灯", load: 0.2 },
  { kind: "bush", label: "灌木", load: 0.3 },
  { kind: "tree", label: "开花小树", load: 0.8 },
];

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
export function updateDecor(list: DecorPlacement[], id: string, patch: Partial<DecorPlacement>): DecorPlacement[] {
  return list.map((d) => (d.id === id ? { ...d, ...patch } : d));
}
export function removeDecor(list: DecorPlacement[], id: string): DecorPlacement[] {
  return list.filter((d) => d.id !== id);
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
    update: (id: string, patch: Partial<DecorPlacement>) => commit(updateDecor(list, id, patch)),
    remove: (id: string) => commit(removeDecor(list, id)),
    reset: () => commit([]),
  };
}
