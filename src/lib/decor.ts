"use client";
/**
 * 星球装饰：前端原型。现在存 localStorage（每台设备独立）；
 * A 的 `/api/decor` 就绪后，把 loadDecor/saveDecor 换成接口即可，其余不变。
 */
import { useEffect, useRef, useState } from "react";

/** 建筑类（H02）：原固定建筑改为可编辑实例，kind 与室内/装饰共用一套布局数据 */
export type DecorKind =
  | "lamp" | "bush" | "tree" | "pot" | "stone" | "fence" | "chair" | "flower" | "flower2" | "flower3" | "rock" | "rose" | "soil" | "road"
  | "cottage" | "greenhouse" | "observatory" | "seedshed" | "arch" | "pond" | "sign"
  | "grassGroup" | "wildflowerGroup"; // H04：程序化群组（整组密度可调，不逐株编辑）
/** 建筑类 kind（与场景热点名一致，点击打开业务入口或热点） */
export const BUILDING_KINDS = ["cottage", "greenhouse", "observatory", "seedshed", "arch", "pond", "sign"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export function isBuildingKind(k: string): k is BuildingKind {
  return (BUILDING_KINDS as readonly string[]).includes(k);
}
/** surface 类（土壤/道路）：用 width(沿局部 x)/length(沿局部 z) 描述面积，scale 不用于放大面积 */
export type DecorPlacement = {
  /** V4-H13：隐藏标记（可恢复；数据保留，不删学习记录） */
  hidden?: boolean;
  id: string; kind: DecorKind; x: number; z: number; rot: number; scale: number;
  color?: string; width?: number; length?: number; stage?: string;
  /** H28/H29：DIY 分区颜色（花瓣/花心/叶片/茎、屋顶/墙面/门窗/饰边…），按部位名存色值 */
  parts?: Record<string, string>;
};

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
  // 建筑类（H02）：原固定建筑也进素材目录，可选中/移动/旋转/缩放/复制
  { kind: "cottage", label: "暖光书屋", load: 2 },
  { kind: "greenhouse", label: "资料温室", load: 2 },
  { kind: "observatory", label: "观测台", load: 1.6 },
  { kind: "seedshed", label: "种子小棚", load: 1.2 },
  { kind: "arch", label: "花园拱门", load: 0.8 },
  { kind: "pond", label: "小池塘", load: 1.4 },
  { kind: "sign", label: "木牌", load: 0.3 },
  // H04：全星球群组（缩放参数当密度用；不可逐株选中，避免几千个实例进入编辑器）
  { kind: "grassGroup", label: "草地（群组）", load: 0 },
  { kind: "wildflowerGroup", label: "野花（群组）", load: 0 },
];

/** 团队可维护的默认布局模板（创造模式「从模板开始 / 恢复默认模板」用；只含用户装饰，不动系统固定物件） */
export const DEFAULT_TEMPLATE: DecorPlacement[] = [
  { id: "tpl-rose-1", kind: "rose", x: -0.35, z: 0.55, rot: 0, scale: 1.2, stage: "bloom" },
  { id: "tpl-rose-2", kind: "rose", x: 0.4, z: 0.52, rot: 20, scale: 0.9, stage: "bud" },
  { id: "tpl-soil", kind: "soil", x: 0, z: 0.78, rot: 0, scale: 1, width: 1.4, length: 0.8 },
  { id: "tpl-road", kind: "road", x: 0.85, z: 0.25, rot: 40, scale: 1, width: 0.5, length: 1.6 },
  { id: "tpl-fence", kind: "fence", x: -0.72, z: 0.5, rot: 90, scale: 1 },
  { id: "tpl-lamp", kind: "lamp", x: 0.72, z: 0.72, rot: 0, scale: 0.9 },
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

/** 订阅装饰列表：localStorage + 自定义事件（跨组件同步）。内置撤销/重做历史（与 list 同源，避免快照错位）。 */
export function useDecor() {
  const [list, setList] = useState<DecorPlacement[]>([]);
  const history = useRef<DecorPlacement[][]>([]);
  const future = useRef<DecorPlacement[][]>([]);
  const [ver, setVer] = useState(0);
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
  /** commit：把当前 list 记入历史（record=true），再写入新列表。
   *  coalesce=true 时，400ms 内的连续调用合并为一次历史（滑杆拖动=一次撤销，G2）。 */
  const lastRecord = useRef(0);
  const transforming = useRef(false); // H12：变换进行中标记（拖动/滑杆），期间不逐帧记历史
  const transformBefore = useRef<DecorPlacement[] | null>(null); // H12：变换前快照（用于判断空变换）
  const commit = (next: DecorPlacement[], record = true, coalesce = false) => {
    // H12：变换（拖动/缩放滑杆）期间不再逐帧记历史——由 beginTransform 在起手时快照一次，
    // 因此「一次拖动 = 一步撤销」，不再依赖 400ms 时间窗近似。
    if (record && !transforming.current) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const skip = coalesce && now - lastRecord.current < 400;
      lastRecord.current = now;
      if (!skip) {
        history.current.push(list);
        if (history.current.length > 50) history.current.shift();
        future.current = [];
        setVer((v) => v + 1);
      }
    }
    saveDecor(next); setList(next);
  };
  /** H12：变换开始——把「变换前」的完整快照压进历史，之后到 endTransform 为止的更新都不再记历史 */
  const beginTransform = () => {
    if (transforming.current) return;
    transforming.current = true;
    transformBefore.current = list;
    history.current.push(list);
    if (history.current.length > 50) history.current.shift();
    future.current = [];
    setVer((v) => v + 1);
  };
  /** H12：变换结束——恢复普通记录模式；若本次变换没有任何实际变化则回退掉那个空快照（避免「点一下没动」也占一步撤销） */
  const endTransform = () => {
    if (!transforming.current) return;
    transforming.current = false;
    const snap = transformBefore.current;
    transformBefore.current = null;
    if (snap && JSON.stringify(snap) === JSON.stringify(list) && history.current.length) {
      history.current.pop();
      setVer((v) => v + 1);
    }
  };
  const undo = () => {
    const prev = history.current.pop(); if (!prev) return;
    future.current.push(list);
    saveDecor(prev); setList(prev); setVer((v) => v + 1);
  };
  const redo = () => {
    const next = future.current.pop(); if (!next) return;
    history.current.push(list);
    saveDecor(next); setList(next); setVer((v) => v + 1);
  };
  return {
    decor: list,
    add: (kind: DecorKind) => commit(addDecor(list, kind)),
    place: (kind: DecorKind, x: number, z: number, opts?: Partial<DecorPlacement>) => {
      // H06：复制预览确认时带上源实例的 rot/scale/color/stage/width/length，保证「预览 = 最终结果」
      const base = addDecorAt(list, kind, x, z);
      const last = base[base.length - 1];
      const merged = opts
        ? base.map((d, i) => (i === base.length - 1 ? { ...last, ...opts, id: last.id, kind, x, z } : d))
        : base;
      commit(merged);
      return (merged[merged.length - 1] as DecorPlacement).id;
    },
    applyPreset: (p: DecorPreset) => commit(addPreset(list, p)),
    update: (id: string, patch: Partial<DecorPlacement>) => commit(updateDecor(list, id, patch), true, true),
    // V4-R18：移动必须独立记一步历史——不走 coalesce（它会把 400ms 内的连续 update 合并掉），
    // 也不受 transforming 影响（那是拖动/滑杆的专用标记）。一次确认 = 一步撤销。
    move: (id: string, x: number, z: number) => {
      const before = list;
      const next = updateDecor(list, id, { x, z });
      if (JSON.stringify(before) === JSON.stringify(next)) return; // 没真动就不占历史
      history.current.push(before);
      if (history.current.length > 50) history.current.shift();
      future.current = [];
      setVer((v) => v + 1);
      saveDecor(next); setList(next);
    },
    beginTransform,
    endTransform,
    remove: (id: string) => commit(removeDecor(list, id)),
    /** 复制实例（H02/H06）：新 id + 轻微偏移避免完全重叠，返回新 id 供选中 */
    duplicate: (id: string) => {
      const src = list.find((d) => d.id === id);
      if (!src) return null;
      const copy: DecorPlacement = {
        ...src,
        id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        x: Math.max(-4, Math.min(4, src.x + 0.25)),
        z: Math.max(-4, Math.min(4, src.z + 0.25)),
      };
      commit([...list, copy]);
      return copy.id;
    },
    reset: () => commit([]),
    /** 用服务端布局整体替换本地列表（G4：加载已保存布局）——不记入撤销历史 */
    setAll: (next: DecorPlacement[]) => commit(next, false),
    /** 从默认模板开始（重新生成 id，记入撤销历史） */
    applyTemplate: (tpl: DecorPlacement[]) => {
      const next = tpl.map((d) => ({ ...d, id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }));
      commit(next);
    },
    undo, redo,
    canUndo: history.current.length > 0,
    canRedo: future.current.length > 0,
    ver,
  };
}
