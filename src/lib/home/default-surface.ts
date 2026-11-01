/**
 * 默认地表格局（与当前星球一致）
 *
 * 由 `planet_layouts`（status=draft）的 bed_moves / terrain / water 导出，2026-11-01。
 * 用途：新账号初始化时套用同一套地表格局，避免出现「默认草树 + 布局树并存」
 * 「SPOTS 池塘 + 布局池塘并存」「SPOTS 路径 + 手工路径并存」这类打架。
 *
 * 键的含义：
 *   __fourzones     四分区模式已启用 → 关闭默认 FloraField 散布树
 *   __manualPaths   路径改为手工点 → 关闭 SPOTS 推导路径与自动地形绘制
 *   __pondEditable  池塘位置由布局决定 → 不再用 SPOTS 固定池塘
 *   __pond          池塘锚点位置
 *   __path-0..N     手工路径点
 *
 * 原始数据备份：data/default-surface.json
 */
import type { DecorPlacement } from "@/lib/decor";

/** 花圃位移 / 地表标记（键为 gardenId 或 __ 开头的特殊键） */
export type BedMoveMap = Record<string, { x: number; z: number; rot?: number }>;

/** 默认地表格局 */
export const DEFAULT_SURFACE_BED_MOVES: BedMoveMap = {
  "__pond": { x: 3.05, z: -0.6, rot: 0 },
  "__path-0": { x: 0.82, z: -0.72, rot: 0 },
  "__path-1": { x: 0.753333, z: -0.82, rot: 0 },
  "__path-2": { x: 0.686667, z: -0.92, rot: 0 },
  "__path-3": { x: 0.62, z: -1.02, rot: 0 },
  "__path-4": { x: 0.473333, z: -1.026667, rot: 0 },
  "__path-5": { x: 0.326667, z: -1.033333, rot: 0 },
  "__path-6": { x: 0.18, z: -1.04, rot: 0 },
  "__path-7": { x: 0.0225, z: -1.04, rot: 0 },
  "__path-8": { x: -0.135, z: -1.04, rot: 0 },
  "__path-9": { x: -0.2925, z: -1.04, rot: 0 },
  "__path-10": { x: -0.45, z: -1.04, rot: 0 },
  "__path-11": { x: -0.5625, z: -0.9675, rot: 0 },
  "__path-12": { x: -0.675, z: -0.895, rot: 0 },
  "__path-13": { x: -0.7875, z: -0.8225, rot: 0 },
  "__path-14": { x: -0.9, z: -0.75, rot: 0 },
  "__path-15": { x: -0.04, z: -1.22, rot: 0 },
  "__path-16": { x: 0.62, z: -1.153333, rot: 0 },
  "__path-17": { x: 0.62, z: -1.286667, rot: 0 },
  "__path-18": { x: 0.62, z: -1.42, rot: 0 },
  "__path-19": { x: 0.71, z: -1.5, rot: 0 },
  "__path-20": { x: 0.8, z: -1.58, rot: 0 },
  "__fourzones": { x: 0.0, z: 0.0, rot: 0 },
  "__manualPaths": { x: 0.0, z: 0.0, rot: 0 },
  "__pondEditable": { x: 0.0, z: 0.0, rot: 0 },
  "2e853285-ce2e-4146-bf2a-dd9d759ae6d0": { x: 0.279906, z: 0.515081, rot: 0 },
  "767bfb4f-d725-49f0-8c53-ff9855d863ec": { x: 0.148435, z: -0.432807, rot: 0 },
};

/** 默认地形高度场（稀疏点）；null = 平地 */
export const DEFAULT_SURFACE_TERRAIN: { i: number; j: number; h: number }[] | null = null;

/** 默认水面高度；null = 无水面 */
export const DEFAULT_SURFACE_WATER: number | null = null;
