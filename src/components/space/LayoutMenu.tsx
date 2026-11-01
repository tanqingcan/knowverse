"use client";
/**
 * V4-R05：独立「布局」面板——把服务器动作、模板恢复、环境密度、导入提示等从素材库里搬出来，
 * 素材库只负责「选素材」。入口在快捷栏右侧「⋯」。
 */
import React from "react";

export function LayoutMenu({ open, onClose, nudgeScale, onNudgeScale, groupDensities, onGroupDensity, revision, status, message, onSave, onPublish, onUndo, onRedo, canUndo, canRedo, onApplyTemplate, onDiscard, importPrompt, onImportLocal, onKeepServer, hasPublished, onRevert, showFirstEntry, onFirstDefault, onFirstTemplate }: {
  open: boolean;
  onClose: () => void;
  /** V4-R14：方向键步长倍率（0.5×/1×/2×），并显示单位 */
  nudgeScale?: number;
  onNudgeScale?: (v: number) => void;
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
}) {
  if (!open) return null;
  return (
    <div className="cp-mask" role="dialog" aria-modal="true" aria-label="布局设置">
      <div className="layout-menu paper">
        <div className="cp-head">
          <b className="cp-title">布局</b>
          <span className="lm-rev">revision {revision ?? 0} · {status === "published" ? "已发布" : "草稿"}</span>
          <button className="btn btn-ghost btn-sm cp-close" onClick={onClose} aria-label="关闭布局面板">收起 ✕</button>
        </div>
        <div className="cp-body">
          {message && <div className="cp-msg" role="status">{message}</div>}
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
          {groupDensities && (
            <section className="lm-sec" aria-label="星球环境与群组">
              <div className="lm-sec-title">星球环境</div>
              <p className="lm-note">天空/恒星/星球本体不可编辑；草与野花按整组调整密度。</p>
              <label className="cp-prop">草地密度 <input type="range" min={0.2} max={2} step={0.1} value={groupDensities.grass} onChange={(e) => onGroupDensity?.("grassGroup", +e.target.value)} /><span>{groupDensities.grass.toFixed(1)}</span></label>
              <label className="cp-prop">野花密度 <input type="range" min={0.2} max={2} step={0.1} value={groupDensities.blooms} onChange={(e) => onGroupDensity?.("wildflowerGroup", +e.target.value)} /><span>{groupDensities.blooms.toFixed(1)}</span></label>
            </section>
          )}
          <section className="lm-sec" aria-label="编辑步长">
            <div className="lm-sec-title">编辑步长</div>
            <p className="lm-note">方向键沿球面移动的步长（单位：星球半径 R）。普通 0.005R、Shift 0.001R、Alt 0.02R；此处可整体加速/减速。</p>
            <div className="cp-foot-actions">
              {[0.5, 1, 2].map((v) => (
                <button key={v} type="button" className={`btn btn-sm ${(nudgeScale ?? 1) === v ? "btn-primary" : "btn-quiet"}`}
                  aria-pressed={(nudgeScale ?? 1) === v} onClick={() => onNudgeScale?.(v)}>{v}×</button>
              ))}
            </div>
            <p className="lm-note">当前：普通 {(0.005 * 3 * (nudgeScale ?? 1)).toFixed(3)} · Shift {(0.001 * 3 * (nudgeScale ?? 1)).toFixed(3)} · Alt {(0.02 * 3 * (nudgeScale ?? 1)).toFixed(3)}</p>
          </section>
          <section className="lm-sec">
            <div className="lm-sec-title">历史</div>
            <div className="cp-foot-actions">
              <button className="btn btn-quiet btn-sm" onClick={onUndo} disabled={!canUndo} aria-label="撤销">↶ 撤销</button>
              <button className="btn btn-quiet btn-sm" onClick={onRedo} disabled={!canRedo} aria-label="重做">↷ 重做</button>
            </div>
          </section>
          <section className="lm-sec">
            <div className="lm-sec-title">服务器</div>
            <div className="cp-foot-actions">
              <button className="btn btn-ghost btn-sm" onClick={onSave}>保存到服务器</button>
              <button className="btn btn-primary btn-sm" onClick={onPublish}>发布</button>
            </div>
            <div className="cp-foot-actions">
              <button className="btn btn-quiet btn-sm" onClick={onRevert} disabled={!hasPublished} title="用上一已发布版本替换当前草稿">恢复已发布</button>
            </div>
          </section>
          <section className="lm-sec">
            <div className="lm-sec-title">模板</div>
            <div className="cp-foot-actions">
              <button className="btn btn-quiet btn-sm" onClick={onApplyTemplate}>从模板开始</button>
              <button className="btn btn-quiet btn-sm" onClick={onDiscard}>放弃修改</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
