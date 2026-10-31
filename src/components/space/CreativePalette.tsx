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

export function CreativePalette({ open, placingKind, onSelect, onCancel, onClose }: {
  open: boolean; placingKind: string | null;
  onSelect: (kind: DecorKind) => void; onCancel: () => void; onClose: () => void;
}) {
  const [kw, setKw] = useState("");
  if (!open) return null;
  const q = kw.trim().toLowerCase();
  const hit = (c: (typeof DECOR_CATALOG)[number]) => !q || c.label.toLowerCase().includes(q) || CATEGORY[c.kind].includes(kw);
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
