/**
 * 家园模式 v3 · 初始首页布局（H02/H03）
 *
 * 原「固定建筑」改为**可编辑实例数据**：这里给出首次进入时的初始布局，
 * 之后所有位置/朝向/缩放都由布局数据驱动（服务端 `planet_layout_items` 或本地草稿），
 * 刷新不会再按 `SPOTS` 常量把建筑画回原位（删除固定渲染分支，避免重影）。
 *
 * 只登记**离散对象**（建筑/家具/灯/木牌/水池）。树/灌木/石头/草/野花仍是实例化群组，
 * 由 H04 说明其操作单元（整组密度/位置），不在这里逐株展开。
 */
import type { DecorPlacement } from "@/lib/decor";
import { SPOTS } from "@/components/world/layout";

/** 建筑 kind → 场景热点名（与 `WorldProps.onHotspot` 的取值一致） */
export const BUILDING_HOTSPOT: Record<string, string> = {
  cottage: "cottage",
  greenhouse: "greenhouse",
  observatory: "observatory",
  seedshed: "seedshed",
  arch: "arch",
  pond: "pond",
  // 书屋内点击 = 对话入口，沿用 cottage 热点
  sign: "sign",
};

/** 首次创建时的初始布局（与 v2 固定渲染的视觉位置一致） */
export const DEFAULT_HOME_LAYOUT: DecorPlacement[] = [
  { id: "home-cottage", kind: "cottage", x: SPOTS.cottage.x, z: SPOTS.cottage.z, rot: SPOTS.cottage.yaw, scale: 0.86 },
  { id: "home-greenhouse", kind: "greenhouse", x: SPOTS.greenhouse.x, z: SPOTS.greenhouse.z, rot: SPOTS.greenhouse.yaw, scale: 1 },
  { id: "home-observatory", kind: "observatory", x: SPOTS.observatory.x, z: SPOTS.observatory.z, rot: SPOTS.observatory.yaw, scale: 1 },
  { id: "home-seedshed", kind: "seedshed", x: SPOTS.seedShed.x, z: SPOTS.seedShed.z, rot: SPOTS.seedShed.yaw, scale: 1 },
  { id: "home-arch", kind: "arch", x: SPOTS.arch.x, z: SPOTS.arch.z, rot: SPOTS.arch.yaw, scale: 1 },
  { id: "home-pond", kind: "pond", x: SPOTS.pond.x, z: SPOTS.pond.z, rot: SPOTS.pond.yaw, scale: 1 },
  { id: "home-bench", kind: "chair", x: SPOTS.bench.x, z: SPOTS.bench.z, rot: SPOTS.bench.yaw, scale: 1 },
  { id: "home-lamp", kind: "lamp", x: SPOTS.lamp.x, z: SPOTS.lamp.z, rot: 0, scale: 1 },
  { id: "home-sign", kind: "sign", x: SPOTS.sign.x, z: SPOTS.sign.z, rot: SPOTS.sign.yaw, scale: 1.5 },
  // H04：全星球群组（scale 当密度倍率：1 = 原来的 380 丛草 / 260 朵野花）
  { id: "home-grass", kind: "grassGroup", x: 0, z: 0, rot: 0, scale: 1 },
  { id: "home-wildflowers", kind: "wildflowerGroup", x: 0, z: 0, rot: 0, scale: 1 },
];

/** 所有「初始离散对象」的实例 id，H03/H14 迁移时用于区分「初始实例」与「用户新增」 */
export const INITIAL_ITEM_IDS = new Set(DEFAULT_HOME_LAYOUT.map((d) => d.id));

/** 是否是初始实例（用于业务语义：复制出来的建筑共享入口，但仍是独立实例） */
export function isInitialItem(id: string): boolean {
  return INITIAL_ITEM_IDS.has(id);
}
