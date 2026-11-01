"use client";
/**
 * H17：沉浸式底部素材快捷栏（9 槽）。
 * 取代「左侧 260px 常驻大面板」：进入创造后只在底部留一条 9 槽快捷栏 + 小型退出/保存入口，
 * 全量素材库通过「全部素材」按钮/E 键按需打开（H19）。
 */
import React, { useEffect, useRef } from "react";
import { DECOR_CATALOG, type DecorKind } from "@/lib/decor";
import { FlowerSvg } from "@/components/art/Flower";

const FLOWER_MAP: Partial<Record<DecorKind, { species: string; color: string }>> = {
  rose: { species: "rose", color: "rose" },
  flower: { species: "sunflower", color: "gold" },
  flower2: { species: "iris", color: "mist" },
  flower3: { species: "lily", color: "cream" },
  pot: { species: "rose", color: "rose" },
};

/** H17：默认 9 槽（花/树/石/围栏/地面/道路/建筑 各一类，覆盖最常用） */
export const DEFAULT_HOTBAR: DecorKind[] = ["rose", "flower2", "tree", "bush", "fence", "stone", "soil", "road", "cottage"];
export const HOTBAR_KEY = "kv-hotbar";

function labelOf(kind: DecorKind): string {
  return DECOR_CATALOG.find((c) => c.kind === kind)?.label ?? kind;
}

export function KindThumb({ kind, size = 26 }: { kind: DecorKind; size?: number }) {
  const f = FLOWER_MAP[kind];
  if (f) return <span className="hb-thumb"><FlowerSvg uid={`hb-${kind}`} species={f.species} color={f.color} stage="bloom" size={size - 4} crop /></span>;
  return <span className="hb-thumb hb-dot" data-kind={kind} aria-hidden="true" />;
}

export function CreativeHotbar({ slots, activeKind, currentSlot, picking, message, continuous, onToggleContinuous, onEditSlot, onPlaceSlot, onPick, onOpenLibrary, onOpenLayout, onSave, onExit, onUndo, onRedo, canUndo, canRedo, onWheelSlot }: {
  /** H20：槽位可为空（null），配置存 localStorage；材质 ID 用 kind，不用场景实例 ID */
  slots: (DecorKind | null)[];
  currentSlot?: number;
  activeKind: DecorKind | null;
  picking?: boolean;
  message?: string | null;
  /** H21：连续放置开关——放完一个仍保持该素材 */
  continuous?: boolean;
  onToggleContinuous?: () => void;
  /** R01：点击槽位 = 进入替换（打开素材库），不再直接进入场景放置 */
  onEditSlot?: (i: number) => void;
  /** R01：独立「直接放置」次要动作 */
  onPlaceSlot?: (i: number) => void;
  onPick?: (k: DecorKind) => void;
  onOpenLibrary: () => void;
  /** V4-R05：打开独立「布局」面板（服务器/模板/环境） */
  onOpenLayout?: () => void;
  onSave: () => void;
  onExit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** H18：在操作栏上滚轮切槽（画布上的滚轮仍归镜头缩放，互不串扰） */
  onWheelSlot?: (dir: 1 | -1) => void;
}) {
  // H18：滚轮必须用原生非 passive 监听才能可靠 preventDefault + 阻断向画布传播
  const barRef = useRef<HTMLDivElement>(null);
  // R02：长按 500ms 进入替换（触摸设备的主要入口）
  const lp = useRef<number | null>(null);
  const cbRef = useRef(onWheelSlot);
  cbRef.current = onWheelSlot;
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cbRef.current?.(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);
  return (
    <div className="hotbar-wrap" role="region" aria-label="创造模式操作栏">
      <div className="hb-side">
        <button className="hb-lib" type="button" onClick={onOpenLibrary} title="打开全部素材库（E）">全部素材</button>
        <button className={`hb-lib ${continuous ? "hb-on" : ""}`} type="button" aria-pressed={!!continuous}
          onClick={onToggleContinuous} title="连续放置：放完一个继续放下一个">连续</button>
      </div>
      <div className="hotbar" ref={barRef} role="toolbar" aria-label="素材快捷栏（1–9 切换；滚轮切槽）">
        {slots.map((kind, i) => {
          const active = kind !== null && activeKind === kind;
          const cur = currentSlot === i;
          return (
            <div key={`${kind ?? "empty"}-${i}`} className={`hb-slot ${active ? "is-active" : ""} ${cur ? "is-current" : ""} ${kind ? "" : "is-empty"}`}
              onContextMenu={(e) => { e.preventDefault(); onEditSlot?.(i); }}
              onPointerDown={() => { lp.current = window.setTimeout(() => onEditSlot?.(i), 500); }}
              onPointerUp={() => { if (lp.current) { clearTimeout(lp.current); lp.current = null; } }}
              onPointerLeave={() => { if (lp.current) { clearTimeout(lp.current); lp.current = null; } }}>
              <button type="button" className="hb-main" onClick={() => onEditSlot?.(i)}
                aria-label={`第 ${i + 1} 槽 ${kind ? labelOf(kind) : "空槽"}（点击替换）`}
                title={`替换第 ${i + 1} 槽${kind ? ` · 当前「${labelOf(kind)}」` : " · 当前空槽"}`}>
                <span className="hb-num" aria-hidden="true">{i + 1}</span>
                {kind ? <KindThumb kind={kind} /> : <span className="hb-empty" aria-hidden="true">+</span>}
                <span className="hb-name">{kind ? labelOf(kind) : "空"}</span>
              </button>
              {kind && (
                <button type="button" className="hb-place" onClick={(e) => { e.stopPropagation(); onPlaceSlot?.(i); }}
                  aria-label={`直接放置第 ${i + 1} 槽：${labelOf(kind)}`} title={`直接放置「${labelOf(kind)}」`}>放</button>
              )}
            </div>
          );
        })}
      </div>
      <div className="hb-side hb-right">
        <button className="hb-mini" type="button" onClick={onOpenLayout} aria-label="布局设置" title="布局：服务器/模板/环境">⋯</button>
        <button className="hb-mini" type="button" onClick={onUndo} disabled={!canUndo} aria-label="撤销">↶</button>
        <button className="hb-mini" type="button" onClick={onRedo} disabled={!canRedo} aria-label="重做">↷</button>
        <button className="hb-mini hb-save" type="button" onClick={onSave}>保存</button>
        <button className="hb-mini hb-exit" type="button" onClick={onExit}>退出</button>
      </div>
      {message && <div className="hb-msg" role="status">{message}</div>}
      {picking && <div className="hb-hint" role="status">把指针移到星球上，出现半透明预览后点击放置 · Esc 取消{continuous ? " · 连续放置中" : ""}</div>}
    </div>
  );
}
