/** 创造模式星球布局：服务端持久化客户端（G4 数据库闭环）。localStorage 只作为本地草稿，服务端是权威。 */
import { api } from "./api";
import type { DecorPlacement } from "./decor";

export type LayoutItem = {
  /** V4-H51：客户端实例 ID（跨刷新/重登稳定） */
  instanceId?: string | null;
  kind: string; x: number; z: number;
  rot?: number; scale?: number;
  width?: number | null; length?: number | null;
  color?: string | null; stage?: string | null;
  /** H34：DIY 分区颜色（旧数据无此字段 → null） */
  parts?: Record<string, string> | null;
};
export type LayoutResponse = {
  planetId: string; revision: number; status: string;
  /** H52：1=迁移前旧布局；2=v3 全场景布局（用户可能删光建筑，不能再补模板） */
  schemaVersion?: number;
  /** V4-R22：花圃位移（键=gardenId） */
  bedMoves?: Record<string, { x: number; z: number; rot?: number }> | null;
  /** V4-R30：地形稀疏高度场 */
  terrain?: { i: number; j: number; h: number }[] | null;
  /** V4-R29：水面高度 */
  water?: number | null;
  publishedRevision: number | null; hasPublished?: boolean; items: LayoutItem[];
};

let seq = 0;
export const toLayoutItem = (d: DecorPlacement): LayoutItem => ({
  instanceId: d.id,
  kind: d.kind, x: d.x, z: d.z, rot: d.rot, scale: d.scale,
  width: d.width ?? null, length: d.length ?? null, color: d.color ?? null, stage: d.stage ?? null,
  // H51：颜色统一小写（服务端也会归一化，这里先做一次保证本地/服务器同口径）
  parts: d.parts ? Object.fromEntries(Object.entries(d.parts).map(([k, v]) => [k, String(v).toLowerCase()])) : null,
});
export const fromLayoutItem = (it: LayoutItem): DecorPlacement => ({
  // V4-H51：优先用持久化的实例 ID（跨刷新/重登/独立上下文稳定），旧数据无则重建
  id: it.instanceId && it.instanceId.length > 0 ? it.instanceId : `s-${Date.now().toString(36)}-${(seq++).toString(36)}`,
  kind: it.kind as DecorPlacement["kind"], x: it.x, z: it.z,
  rot: it.rot ?? 0, scale: it.scale ?? 1,
  width: it.width ?? undefined, length: it.length ?? undefined,
  color: it.color ?? undefined, stage: it.stage ?? undefined,
  parts: it.parts ?? undefined,
});

export function loadLayout() { return api<LayoutResponse>("/api/planet-layout"); }
export function saveLayout(baseRevision: number, list: DecorPlacement[], bedMoves?: Record<string, { x: number; z: number; rot?: number }>, terrain?: { i: number; j: number; h: number }[] | null, water?: number | null) {
  return api<{ revision: number; status: string }>("/api/planet-layout", {
    method: "PUT",
    body: { baseRevision, items: list.map(toLayoutItem), bedMoves: bedMoves ?? {}, terrain: terrain ?? null, water: water ?? null },
  });
}
export function publishLayout(baseRevision: number) {
  return api<{ revision: number; status: string }>("/api/planet-layout/publish", { method: "POST", body: { baseRevision } });
}
/** 恢复上一已发布版本（用 published_items 快照替换草稿，revision+1） */
export function revertLayout() {
  return api<{ revision: number; status: string; items: LayoutItem[] }>("/api/planet-layout/revert", { method: "POST" });
}
