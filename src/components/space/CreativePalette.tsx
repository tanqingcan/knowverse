"use client";
/** 创造模式素材栏：分类 + 搜索 + 选中反馈。选中后进入「放置预览」，点击球面确定，Esc 取消。 */
import React, { useState } from "react";
import { DECOR_CATALOG, type DecorKind } from "@/lib/decor";

const CATEGORY: Record<DecorKind, string> = {
  rose: "花卉", flower: "花卉", flower2: "花卉", flower3: "花卉", pot: "花卉",
  tree: "树木", bush: "树木",
  fence: "围栏",
  soil: "地板", road: "道路",
  lamp: "灯具",
  chair: "建筑", stone: "建筑", rock: "建筑",
};

const CATEGORY_ORDER = ["花卉", "树木", "建筑", "围栏", "地板", "道路", "灯具"];

export function CreativePalette({ open, placingKind, selected, onUpdate, onRemove, revision, status, message, onSave, onPublish, onSelect, onCancel, onClose }: {
  open: boolean; placingKind: string | null;
  selected?: { id: string; kind: string; scale: number; width?: number; length?: number; rot?: number } | null;
  onUpdate?: (patch: { scale?: number; width?: number; length?: number; rot?: number }) => void;
  onRemove?: () => void;
  revision?: number; status?: string; message?: string | null;
  onSave?: () => void; onPublish?: () => void;
  onSelect: (kind: DecorKind) => void; onCancel: () => void; onClose: () => void;
}) {
  const [kw, setKw] = useState("");
  if (!open) return null;
  const q = kw.trim().toLowerCase();
  const hit = (c: (typeof DECOR_CATALOG)[number]) => !q || c.label.toLowerCase().includes(q) || CATEGORY[c.kind].includes(kw);
  const selSurface = selected && (selected.kind === "soil" || selected.kind === "road");
  return (
    <aside className="creative-palette paper" aria-label="创造模式素材栏">
      <div className="cp-head">
        <b>创造模式</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="收起素材栏">收起</button>
      </div>
      {placingKind && (
        <div className="cp-placing" role="status">
          <span>正在放置「{DECOR_CATALOG.find((c) => c.kind === placingKind)?.label ?? placingKind}」——点击球面确定，Esc 取消</span>
          <button className="btn btn-quiet btn-sm" onClick={onCancel}>取消</button>
        </div>
      )}
      {selected && (
        <div className="cp-props" aria-label="选中对象属性">
          <div className="cp-prop-title">选中：{DECOR_CATALOG.find((c) => c.kind === selected.kind)?.label ?? selected.kind}</div>
          {selSurface ? (
            <>
              <label className="cp-prop">宽 <input type="range" min={0.3} max={2.4} step={0.05} value={selected.width ?? 0.7} onChange={(e) => onUpdate?.({ width: +e.target.value })} /><span>{(selected.width ?? 0.7).toFixed(2)}</span></label>
              <label className="cp-prop">长 <input type="range" min={0.3} max={2.4} step={0.05} value={selected.length ?? 0.7} onChange={(e) => onUpdate?.({ length: +e.target.value })} /><span>{(selected.length ?? 0.7).toFixed(2)}</span></label>
            </>
          ) : (
            <label className="cp-prop">比例 <input type="range" min={0.5} max={2} step={0.05} value={selected.scale} onChange={(e) => onUpdate?.({ scale: +e.target.value })} /><span>{selected.scale.toFixed(2)}</span></label>
          )}
          <label className="cp-prop">旋转 <input type="range" min={-180} max={180} step={5} value={selected.rot ?? 0} onChange={(e) => onUpdate?.({ rot: +e.target.value })} /><span>{Math.round(selected.rot ?? 0)}°</span></label>
          <div className="cp-prop-actions"><button className="btn btn-quiet btn-sm" onClick={onRemove}>删除</button></div>
        </div>
      )}
      <div className="cp-search">
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索素材" aria-label="搜索素材" type="search" />
      </div>
      <div className="cp-groups">
        {CATEGORY_ORDER.map((cat) => {
          const items = DECOR_CATALOG.filter((c) => CATEGORY[c.kind] === cat && hit(c));
          if (!items.length) return null;
          return (
            <div key={cat} className="cp-group">
              <div className="cp-cat">{cat}</div>
              <div className="cp-items">
                {items.map((c) => (
                  <button key={c.kind} className={`cp-item ${placingKind === c.kind ? "sel" : ""}`} onClick={() => onSelect(c.kind)} aria-pressed={placingKind === c.kind}>
                    <span className="cp-dot" style={{ background: kindColor(c.kind) }} />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cp-foot">
        <div className="cp-rev">当前布局：revision {revision ?? 0} · {status === "published" ? "已发布" : "草稿"}</div>
        {message && <div className="cp-msg" role="status">{message}</div>}
        <div className="cp-foot-actions">
          <button className="btn btn-ghost btn-sm" onClick={onSave}>保存到服务器</button>
          <button className="btn btn-primary btn-sm" onClick={onPublish}>发布</button>
        </div>
      </div>
    </aside>
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
