"use client";
/** 创造模式素材栏：分类 + 搜索 + 选中反馈。选中后进入「放置预览」，点击球面确定，Esc 取消。 */
import React, { useState } from "react";
import { DECOR_CATALOG, type DecorKind } from "@/lib/decor";
import { FlowerSvg } from "@/components/art/Flower";

/** 花卉类用真实花形缩略图，其余用色点 */
const FLOWER_MAP: Partial<Record<DecorKind, { species: string; color: string }>> = {
  rose: { species: "rose", color: "rose" },
  flower: { species: "sunflower", color: "gold" },
  flower2: { species: "iris", color: "mist" },
  flower3: { species: "lily", color: "cream" },
  pot: { species: "rose", color: "rose" },
};
function KindThumb({ kind }: { kind: DecorKind }) {
  const f = FLOWER_MAP[kind];
  if (f) return <span className="cp-thumb"><FlowerSvg uid={`cp-${kind}`} species={f.species} color={f.color} stage="bloom" size={22} crop /></span>;
  return <span className="cp-thumb cp-dot" style={{ background: kindColor(kind) }} />;
}

const CATEGORY: Record<DecorKind, string> = {
  rose: "花卉", flower: "花卉", flower2: "花卉", flower3: "花卉", pot: "花卉",
  tree: "树木", bush: "树木",
  fence: "围栏",
  soil: "地板", road: "道路",
  lamp: "灯具",
  chair: "建筑", stone: "建筑", rock: "建筑",
  // H02：建筑类也可从素材栏放置（与原固定建筑同一套数据）
  cottage: "建筑", greenhouse: "建筑", observatory: "建筑", seedshed: "建筑", arch: "建筑", pond: "建筑", sign: "建筑",
  // H04：群组不逐项放置，走底部「星球环境」的整组密度滑杆
  grassGroup: "地板", wildflowerGroup: "花卉",
};

const CATEGORY_ORDER = ["花卉", "树木", "建筑", "围栏", "地板", "道路", "灯具"];

export function CreativePalette({ open, placingKind, selected, onUpdate, onRemove, onDuplicate, slotMode, activeSlot, onToggleSlotMode, onClearSlot, groupDensities, onGroupDensity, revision, status, message, onSave, onPublish, onUndo, onRedo, canUndo, canRedo, onApplyTemplate, onDiscard, importPrompt, onImportLocal, onKeepServer, hasPublished, onRevert, showFirstEntry, onFirstDefault, onFirstTemplate, onSelect, onCancel, onClose }: {
  open: boolean; placingKind: string | null;
  selected?: { id: string; kind: string; x?: number; z?: number; scale: number; width?: number; length?: number; rot?: number; stage?: string; color?: string } | null;
  onUpdate?: (patch: { x?: number; z?: number; scale?: number; width?: number; length?: number; rot?: number; stage?: string; color?: string }) => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  /** H20：素材库内「放入槽位」模式——点素材写入当前槽（覆盖已有），而不是直接放置 */
  slotMode?: boolean;
  activeSlot?: number;
  onToggleSlotMode?: () => void;
  onClearSlot?: () => void;
  /** H04：草/野花「全星球群组」的密度（操作单元 = 整组，不逐株） */
  groupDensities?: { grass: number; blooms: number };
  onGroupDensity?: (kind: "grassGroup" | "wildflowerGroup", v: number) => void;
  revision?: number; status?: string; message?: string | null;
  onSave?: () => void; onPublish?: () => void;
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  onApplyTemplate?: () => void; onDiscard?: () => void;
  importPrompt?: { local: number; server: number } | null;
  onImportLocal?: () => void; onKeepServer?: () => void;
  hasPublished?: boolean; onRevert?: () => void;
  showFirstEntry?: boolean; onFirstDefault?: () => void; onFirstTemplate?: () => void;
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
        <b>全部素材</b>
        {/* H20：明确的「放入槽位」按钮——点它进入选材模式，再点素材写入当前槽 */}
        <button className={`btn btn-sm ${slotMode ? "btn-primary" : "btn-quiet"}`} onClick={onToggleSlotMode} aria-pressed={slotMode}>
          {slotMode ? `选材放入第 ${(activeSlot ?? 0) + 1} 槽…` : `放入第 ${(activeSlot ?? 0) + 1} 槽`}
        </button>
        {/* H20：空槽规则——可把当前槽清空（空槽在快捷栏显示为「+」） */}
        <button className="btn btn-quiet btn-sm" onClick={onClearSlot} title="把当前槽清空">清空槽</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="收起素材栏">收起</button>
      </div>
      {showFirstEntry && (
        <div className="cp-import" role="status">
          <span>你的星球还没有布置过：保持默认，或者从模板开始创造。</span>
          <div className="cp-import-actions">
            <button className="btn btn-primary btn-sm" onClick={onFirstTemplate}>从模板开始创造</button>
            <button className="btn btn-quiet btn-sm" onClick={onFirstDefault}>保持默认</button>
          </div>
        </div>
      )}
      {importPrompt && (
        <div className="cp-import" role="alert">
          <span>检测到本地旧版草稿 {importPrompt.local} 件（已备份），服务器布局 {importPrompt.server} 件。是否导入本地草稿？</span>
          <div className="cp-import-actions">
            <button className="btn btn-primary btn-sm" onClick={onImportLocal}>导入本地</button>
            <button className="btn btn-quiet btn-sm" onClick={onKeepServer}>保持服务器</button>
          </div>
        </div>
      )}
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
          {/* H11：数值精调——位置轴含义：X 为球冠平面「左右」、Z 为「前后（远离镜头）」 */}
          <label className="cp-prop">位置 X（左右） <input type="range" min={-4} max={4} step={0.05} value={selected.x ?? 0} onChange={(e) => onUpdate?.({ x: +e.target.value })} /><span>{(selected.x ?? 0).toFixed(2)}</span></label>
          <label className="cp-prop">位置 Z（前后） <input type="range" min={-4} max={4} step={0.05} value={selected.z ?? 0} onChange={(e) => onUpdate?.({ z: +e.target.value })} /><span>{(selected.z ?? 0).toFixed(2)}</span></label>
          {selected.kind === "rose" && (
            <label className="cp-prop">阶段
              <select value={selected.stage ?? "bloom"} onChange={(e) => onUpdate?.({ stage: e.target.value })} aria-label="玫瑰外观阶段">
                <option value="seed">种子</option><option value="sprout">萌芽</option><option value="leaf">生叶</option><option value="bud">花苞</option><option value="bloom">开花</option>
              </select>
            </label>
          )}
          {/* H07：按实例改色（克隆材质，不串色）；完整的分区 DIY 工作台见 H28–H34 */}
          <label className="cp-prop">颜色 <input type="color" value={selected.color ?? "#C56E6E"} onChange={(e) => onUpdate?.({ color: e.target.value })} aria-label="对象颜色" /><button className="btn btn-quiet btn-sm" type="button" onClick={() => onUpdate?.({ color: undefined })} title="恢复默认颜色">默认</button></label>
          <div className="cp-prop-actions">
            <button className="btn btn-quiet btn-sm" onClick={onDuplicate} title="复制一份（Ctrl+D）">复制</button>
            <button className="btn btn-quiet btn-sm" onClick={onRemove}>删除</button>
          </div>
        </div>
      )}
      <div className="cp-search">
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索素材" aria-label="搜索素材" type="search" />
      </div>
      <div className="cp-groups">
        {CATEGORY_ORDER.map((cat) => {
          const items = DECOR_CATALOG.filter((c) => c.kind !== "grassGroup" && c.kind !== "wildflowerGroup" && CATEGORY[c.kind] === cat && hit(c));
          if (!items.length) return null;
          return (
            <div key={cat} className="cp-group">
              <div className="cp-cat">{cat}</div>
              <div className="cp-items">
                {items.map((c) => (
                  <button key={c.kind} className={`cp-item ${placingKind === c.kind ? "sel" : ""}`} onClick={() => onSelect(c.kind)} aria-pressed={placingKind === c.kind}>
                    <KindThumb kind={c.kind} />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cp-foot">
        {groupDensities && (
          <div className="cp-env" aria-label="星球环境与群组">
            <div className="cp-env-title">星球环境（天空/恒星/星球本体不可编辑；草与野花按整组调整）</div>
            <label className="cp-prop">草地密度 <input type="range" min={0.2} max={2} step={0.1} value={groupDensities.grass} onChange={(e) => onGroupDensity?.("grassGroup", +e.target.value)} /><span>{groupDensities.grass.toFixed(1)}</span></label>
            <label className="cp-prop">野花密度 <input type="range" min={0.2} max={2} step={0.1} value={groupDensities.blooms} onChange={(e) => onGroupDensity?.("wildflowerGroup", +e.target.value)} /><span>{groupDensities.blooms.toFixed(1)}</span></label>
          </div>
        )}
        <div className="cp-rev">当前布局：revision {revision ?? 0} · {status === "published" ? "已发布" : "草稿"}</div>
        {message && <div className="cp-msg" role="status">{message}</div>}
        <div className="cp-foot-actions">
          <button className="btn btn-quiet btn-sm" onClick={onUndo} disabled={!canUndo} aria-label="撤销">↶ 撤销</button>
          <button className="btn btn-quiet btn-sm" onClick={onRedo} disabled={!canRedo} aria-label="重做">↷ 重做</button>
        </div>
        <div className="cp-foot-actions">
          <button className="btn btn-ghost btn-sm" onClick={onSave}>保存到服务器</button>
          <button className="btn btn-primary btn-sm" onClick={onPublish}>发布</button>
        </div>
        <div className="cp-foot-actions">
          <button className="btn btn-quiet btn-sm" onClick={onApplyTemplate}>从模板开始</button>
          <button className="btn btn-quiet btn-sm" onClick={onDiscard}>放弃修改</button>
        </div>
        <div className="cp-foot-actions">
          <button className="btn btn-quiet btn-sm" onClick={onRevert} disabled={!hasPublished} title="用上一已发布版本替换当前草稿">恢复已发布</button>
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
