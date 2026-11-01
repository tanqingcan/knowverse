"use client";
/**
 * V4-R05：全量素材库 = 居中可收起分类网格。
 * 结构固定三层：头部（标题 + 替换提示 + 搜索，sticky）/ 主体（分类网格，内部滚动）/ 底部（操作，固定）。
 * 服务器/模板/环境密度等动作已移到独立的「布局」面板，不再塞进本窗口。
 */
import React, { useMemo, useState } from "react";
import { DECOR_CATALOG, type DecorKind } from "@/lib/decor";
import { FlowerSvg } from "@/components/art/Flower";

const FLOWER_MAP: Partial<Record<DecorKind, { species: string; color: string }>> = {
  rose: { species: "rose", color: "rose" },
  flower: { species: "sunflower", color: "gold" },
  flower2: { species: "iris", color: "mist" },
  flower3: { species: "lily", color: "cream" },
  pot: { species: "rose", color: "rose" },
};

/** 缩略图：花卉用真实花形，建筑/家具用可辨认的小图形，其余用色块（R06 要求能辨认，不只色点） */
function KindThumb({ kind, big = false }: { kind: DecorKind; big?: boolean }) {
  const size = big ? 40 : 26;
  const f = FLOWER_MAP[kind];
  if (f) return <span className="cp-thumb"><FlowerSvg uid={`cp-${kind}`} species={f.species} color={f.color} stage="bloom" size={size} crop /></span>;
  const glyph: Partial<Record<DecorKind, string>> = {
    cottage: "⌂", greenhouse: "◫", observatory: "◎", seedshed: "◱", arch: "∩", pond: "⊂", sign: "▭",
    tree: "♣", bush: "❦", fence: "|||", soil: "▤", road: "⇢", lamp: "✧", chair: "⊔", stone: "●", rock: "◆", pot: "⏢",
  };
  const g = glyph[kind];
  if (g) return <span className={`cp-thumb cp-glyph ${big ? "is-big" : ""}`} style={{ color: kindColor(kind) }} aria-hidden="true">{g}</span>;
  return <span className="cp-thumb cp-dot" style={{ background: kindColor(kind) }} aria-hidden="true" />;
}

const CATEGORY: Record<DecorKind, string> = {
  rose: "花卉", flower: "花卉", flower2: "花卉", flower3: "花卉", pot: "花卉",
  tree: "树木", bush: "树木",
  fence: "围栏",
  soil: "地板", road: "道路",
  lamp: "灯具",
  chair: "建筑", stone: "建筑", rock: "建筑",
  cottage: "建筑", greenhouse: "建筑", observatory: "建筑", seedshed: "建筑", arch: "建筑", pond: "建筑", sign: "建筑",
  grassGroup: "地板", wildflowerGroup: "花卉",
};
const CATEGORY_ORDER = ["建筑", "花卉", "树木", "围栏", "地板", "道路", "灯具"];

export function CreativePalette({ open, placingKind, selected, onUpdate, onRemove, onDuplicate, replaceLabel, onClearSlot, onSelect, onCancel, onClose }: {
  open: boolean; placingKind: string | null;
  selected?: { id: string; kind: string; x?: number; z?: number; scale: number; width?: number; length?: number; rot?: number; stage?: string; color?: string } | null;
  onUpdate?: (patch: { x?: number; z?: number; scale?: number; width?: number; length?: number; rot?: number; stage?: string; color?: string }) => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  replaceSlot?: number | null;
  replaceLabel?: string | null;
  activeSlot?: number;
  onClearSlot?: () => void;
  onSelect: (kind: DecorKind) => void; onCancel: () => void; onClose: () => void;
}) {
  const [kw, setKw] = useState("");
  const [showProps, setShowProps] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const q = kw.trim().toLowerCase();
    const hit = (c: (typeof DECOR_CATALOG)[number]) => !q || c.label.toLowerCase().includes(q) || CATEGORY[c.kind].includes(kw);
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: DECOR_CATALOG.filter((c) => c.kind !== "grassGroup" && c.kind !== "wildflowerGroup" && CATEGORY[c.kind] === cat && hit(c)),
    })).filter((g) => g.items.length > 0);
  }, [kw]);
  if (!open) return null;
  const selSurface = selected && (selected.kind === "soil" || selected.kind === "road");
  const selLabel = selected ? (DECOR_CATALOG.find((c) => c.kind === selected.kind)?.label ?? selected.kind) : "";
  return (
    <div className="cp-mask" role="dialog" aria-modal="true" aria-label="全部素材">
      <div className="creative-palette paper">
        {/* 头部固定：标题 + 替换提示 + 搜索 */}
        <div className="cp-head">
          <b className="cp-title">{replaceLabel ? "替换槽位" : "全部素材"}</b>
          <div className="cp-search">
            <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索素材…" aria-label="搜索素材" type="search" />
          </div>
          <button className="btn btn-ghost btn-sm cp-close" onClick={onClose} aria-label="收起素材栏">收起 ✕</button>
        </div>
        {replaceLabel && (
          <div className="cp-replace-bar" role="status" aria-live="polite">{replaceLabel}</div>
        )}
        {placingKind && (
          <div className="cp-placing" role="status">
            <span>正在放置「{DECOR_CATALOG.find((c) => c.kind === placingKind)?.label ?? placingKind}」——点击球面确定，Esc 取消</span>
            <button className="btn btn-quiet btn-sm" onClick={onCancel}>取消放置</button>
          </div>
        )}
        {/* 主体内部滚动：分类网格 */}
        <div className="cp-body">
          {groups.length === 0 && <p className="cp-empty">没有匹配的素材，换个关键词试试。</p>}
          {groups.map((g) => (
            <section key={g.cat} className="cp-group">
              <button className="cp-cat" onClick={() => setCollapsed((v) => ({ ...v, [g.cat]: !v[g.cat] }))} aria-expanded={!collapsed[g.cat]}>
                <span>{g.cat}</span><span className="cp-cat-n">{g.items.length}</span><span className="cp-cat-x">{collapsed[g.cat] ? "+" : "−"}</span>
              </button>
              {!collapsed[g.cat] && (
                <div className="cp-grid">
                  {g.items.map((c) => (
                    <button key={c.kind} className={`cp-tile ${placingKind === c.kind ? "sel" : ""}`} onClick={() => onSelect(c.kind)} aria-label={c.label} title={c.label}>
                      <KindThumb kind={c.kind} big />
                      <span className="cp-tile-name">{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
          {selected && (
            <section className="cp-group cp-selected">
              <button className="cp-cat" onClick={() => setShowProps((v) => !v)} aria-expanded={showProps}>
                <span>选中对象：{selLabel}</span><span className="cp-cat-x">{showProps ? "−" : "+"}</span>
              </button>
              {showProps && (
                <div className="cp-prop-wrap">
                  {selSurface ? (
                    <>
                      <label className="cp-prop">宽 <input type="range" min={0.3} max={2.4} step={0.05} value={selected.width ?? 0.7} onChange={(e) => onUpdate?.({ width: +e.target.value })} /><span>{(selected.width ?? 0.7).toFixed(2)}</span></label>
                      <label className="cp-prop">长 <input type="range" min={0.3} max={2.4} step={0.05} value={selected.length ?? 0.7} onChange={(e) => onUpdate?.({ length: +e.target.value })} /><span>{(selected.length ?? 0.7).toFixed(2)}</span></label>
                    </>
                  ) : (
                    <label className="cp-prop">比例 <input type="range" min={0.5} max={2} step={0.05} value={selected.scale} onChange={(e) => onUpdate?.({ scale: +e.target.value })} /><span>{selected.scale.toFixed(2)}</span></label>
                  )}
                  <label className="cp-prop">旋转 <input type="range" min={-180} max={180} step={5} value={selected.rot ?? 0} onChange={(e) => onUpdate?.({ rot: +e.target.value })} /><span>{Math.round(selected.rot ?? 0)}°</span></label>
                  <label className="cp-prop">位置 X（左右） <input type="range" min={-4} max={4} step={0.05} value={selected.x ?? 0} onChange={(e) => onUpdate?.({ x: +e.target.value })} /><span>{(selected.x ?? 0).toFixed(2)}</span></label>
                  <label className="cp-prop">位置 Z（前后） <input type="range" min={-4} max={4} step={0.05} value={selected.z ?? 0} onChange={(e) => onUpdate?.({ z: +e.target.value })} /><span>{(selected.z ?? 0).toFixed(2)}</span></label>
                  <label className="cp-prop">颜色 <input type="color" value={selected.color ?? "#C56E6E"} onChange={(e) => onUpdate?.({ color: e.target.value })} aria-label="对象颜色" /><button className="btn btn-quiet btn-sm" type="button" onClick={() => onUpdate?.({ color: undefined })}>默认</button></label>
                  <div className="cp-prop-actions">
                    <button className="btn btn-quiet btn-sm" onClick={onDuplicate}>复制</button>
                    <button className="btn btn-quiet btn-sm" onClick={onRemove}>删除</button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
        {/* 底部固定：只放与「选材」直接相关的动作 */}
        <div className="cp-foot">
          <button className="btn btn-quiet btn-sm" onClick={onClearSlot} title="把当前槽清空">清空当前槽</button>
          <span className="cp-foot-hint">{replaceLabel ? "点素材 = 立刻换到该槽" : "点素材 = 放进当前槽"}</span>
          <button className="btn btn-primary btn-sm" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

function kindColor(kind: DecorKind): string {
  switch (kind) {
    case "rose": return "#C56E6E";
    case "flower": return "#F2C9B6";
    case "flower2": return "#E4A1AA";
    case "flower3": return "#FFF7E8";
    case "pot": return "#C88A6E";
    case "tree": return "#EBB2BB";
    case "bush": return "#8DAF78";
    case "fence": return "#B5835C";
    case "soil": return "#A07C63";
    case "road": return "#C9C2B6";
    case "lamp": return "#DDB56D";
    case "chair": return "#B5835C";
    case "stone": return "#9AA5B1";
    case "rock": return "#8A96A3";
    default: return "#C4D3A8";
  }
}
