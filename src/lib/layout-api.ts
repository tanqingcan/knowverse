/** 创造模式星球布局：服务端持久化客户端（G4 数据库闭环）。localStorage 只作为本地草稿，服务端是权威。 */
import { api } from "./api";
import type { DecorPlacement } from "./decor";

export type LayoutItem = {
  kind: string; x: number; z: number;
  rot?: number; scale?: number;
  width?: number | null; length?: number | null;
  color?: string | null; stage?: string | null;
  /** H34：DIY 分区颜色（旧数据无此字段 → null） */
  parts?: Record<string, string> | null;
};
export type LayoutResponse = {
  planetId: string; revision: number; status: string;
  publishedRevision: number | null; hasPublished?: boolean; items: LayoutItem[];
};

let seq = 0;
export const toLayoutItem = (d: DecorPlacement): LayoutItem => ({
  kind: d.kind, x: d.x, z: d.z, rot: d.rot, scale: d.scale,
  width: d.width ?? null, length: d.length ?? null, color: d.color ?? null, stage: d.stage ?? null,
  parts: d.parts ?? null,
});
export const fromLayoutItem = (it: LayoutItem): DecorPlacement => ({
  id: `s-${Date.now().toString(36)}-${(seq++).toString(36)}`,
  kind: it.kind as DecorPlacement["kind"], x: it.x, z: it.z,
  rot: it.rot ?? 0, scale: it.scale ?? 1,
  width: it.width ?? undefined, length: it.length ?? undefined,
  color: it.color ?? undefined, stage: it.stage ?? undefined,
  parts: it.parts ?? undefined,
});

export function loadLayout() { return api<LayoutResponse>("/api/planet-layout"); }
export function saveLayout(baseRevision: number, list: DecorPlacement[]) {
  return api<{ revision: number; status: string }>("/api/planet-layout", { method: "PUT", body: { baseRevision, items: list.map(toLayoutItem) } });
}
export function publishLayout(baseRevision: number) {
  return api<{ revision: number; status: string }>("/api/planet-layout/publish", { method: "POST", body: { baseRevision } });
}
/** 恢复上一已发布版本（用 published_items 快照替换草稿，revision+1） */
export function revertLayout() {
  return api<{ revision: number; status: string; items: LayoutItem[] }>("/api/planet-layout/revert", { method: "POST" });
}
