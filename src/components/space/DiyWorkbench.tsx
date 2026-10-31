"use client";
/**
 * H28：独立 DIY 工作台——选中花或房屋后打开，展示该对象的大型可旋转预览、颜色分区、色板、应用与取消。
 * 预览用独立的小 Canvas（不卸载主星球场景），返回时主场景的选中对象与镜头都保持不变。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { DecorItem } from "@/components/world/DecorItem";
import { DECOR_CATALOG, type DecorKind, type DecorPlacement } from "@/lib/decor";

/** H29：各类对象的可改色分区（花：花瓣/花心/叶片/茎；房屋：屋顶/墙面/门窗/饰边） */
export const DIY_PARTS: Record<string, { key: string; label: string; def: string }[]> = {
  // H29：只列「模型里真实存在的独立部位」——玫瑰/鸢尾/百合没有独立花心网格，就不假装有
  rose: [
    { key: "petal", label: "花瓣", def: "#C56E6E" },
    { key: "leaf", label: "叶片", def: "#8DAF78" },
    { key: "stem", label: "茎", def: "#7C9B67" },
  ],
  flower: [
    { key: "petal", label: "花瓣", def: "#F2C9B6" }, { key: "core", label: "花心", def: "#5A3B22" },
    { key: "leaf", label: "叶片", def: "#8DAF78" }, { key: "stem", label: "茎", def: "#7C9B67" },
  ],
  flower2: [
    { key: "petal", label: "花瓣", def: "#E4A1AA" },
    { key: "leaf", label: "叶片", def: "#8DAF78" }, { key: "stem", label: "茎", def: "#7C9B67" },
  ],
  flower3: [
    { key: "petal", label: "花瓣", def: "#FFF7E8" },
    { key: "leaf", label: "叶片", def: "#8DAF78" }, { key: "stem", label: "茎", def: "#7C9B67" },
  ],
  cottage: [
    { key: "roof", label: "屋顶", def: "#C56E6E" }, { key: "wall", label: "墙面", def: "#F6E8D6" },
    { key: "window", label: "门窗", def: "#FFE9B8" }, { key: "trim", label: "饰边", def: "#B5835C" },
  ],
  greenhouse: [
    { key: "roofGlass", label: "屋顶玻璃", def: "#BFD8CE" }, { key: "frame", label: "框架", def: "#B5835C" },
    { key: "base", label: "基座", def: "#9AA5B1" },
  ],
  seedshed: [{ key: "roof", label: "屋顶", def: "#C9A06E" }, { key: "wall", label: "墙面", def: "#EBD9BF" }],
  observatory: [{ key: "dome", label: "穹顶", def: "#9CAFC5" }, { key: "wall", label: "墙面", def: "#E8DCC8" }, { key: "lens", label: "镜筒", def: "#DDB56D" }],
};

/** H30：绘本暖光的协调预设（每行一套：主色/点缀/叶/茎） */
/** H35：只有「装饰花」允许在 DIY 里改外观阶段；知识植物的阶段来自学习证据，不在此处提供 */
const STAGE_KINDS = ["rose", "flower", "flower2", "flower3"];
const STAGES: [string, string][] = [["seed", "种子"], ["sprout", "萌芽"], ["leaf", "生叶"], ["bud", "花苞"], ["bloom", "开花"]];

const PRESETS: string[][] = [
  ["#C56E6E", "#EBB2BB", "#8DAF78", "#7C9B67"],
  ["#E0A96D", "#F6D3B2", "#9DBE86", "#7C9B67"],
  ["#8C9BC4", "#C7D0E8", "#8DAF78", "#6F8F61"],
  ["#C9A06E", "#F6E8D6", "#A8C08C", "#7C9B67"],
  ["#D89BA8", "#F6D3D8", "#93B383", "#6F8F61"],
  ["#B9A9D6", "#E4DCF0", "#8DAF78", "#7C9B67"],
];

function labelOf(kind: string) {
  return DECOR_CATALOG.find((c) => c.kind === kind)?.label ?? kind;
}

/** 预览时取哪个部位当「整体近似色」（H29 落地分区渲染前，用它给预览一个可视反馈；不再用 ?? 链乱猜） */
const PRIMARY_PART: Record<string, string> = {
  rose: "petal", flower: "petal", flower2: "petal", flower3: "petal", pot: "petal",
  cottage: "roof", greenhouse: "roofGlass", seedshed: "roof", observatory: "dome",
};

/** 预览用的小画布：模型缓慢自转 + 拖拽旋转（不依赖相机控制器库） */
function Preview({ kind, stage, parts, spin }: { kind: string; stage?: string; parts: Record<string, string>; spin: number }) {
  const ref = useRef<THREE.Group>(null);
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 1.2, 2.6], fov: 38 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={1.1} />
      <directionalLight position={[2.5, 4, 2]} intensity={2.2} />
      <directionalLight position={[-2, 1.5, -1.5]} intensity={0.7} color="#C9B8E8" />
      <group ref={ref} rotation={[0, spin, 0]} position={[0, -0.35, 0]}>
        <DecorItem kind={kind as DecorKind} seed={7} lights={1} stage={stage} parts={parts} tint={parts[PRIMARY_PART[kind] ?? ""] ?? undefined} />
      </group>
    </Canvas>
  );
}

export function DiyWorkbench({ item, onApply, onCancel, onSaveVariant }: {
  item: DecorPlacement;
  onApply: (parts: Record<string, string>, stage?: string) => void;
  onCancel: () => void;
  /** H32：把当前配色存成「我的素材变体」，之后新放置该素材时复用（不改同类已有对象） */
  onSaveVariant?: (parts: Record<string, string>) => void;
}) {
  const partDefs = useMemo(() => DIY_PARTS[item.kind] ?? [{ key: "primary", label: "整体", def: item.color ?? "#C56E6E" }], [item.kind, item.color]);
  const [parts, setParts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    // H51：与服务端一致，颜色统一小写，避免刷新前后仅大小写不同被误判为不一致
    for (const p of partDefs) init[p.key] = (item.parts?.[p.key] ?? p.def).toLowerCase();
    return init;
  });
  const [activePart, setActivePart] = useState(partDefs[0]?.key ?? "primary");
  const [spin, setSpin] = useState(0.5);
  const [stage, setStage] = useState<string>(item.stage ?? "bloom");
  const dragging = useRef<{ x: number; spin: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // H36：Esc = 取消并返回；打开时把焦点移进工作台，关闭时归还（场景快捷键由父层屏蔽）
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = cardRef.current?.querySelector<HTMLElement>("button, select, input");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); return; }
      if (e.key !== "Tab" || !cardRef.current) return;
      const nodes = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button, select, input, [tabindex]:not([tabindex='-1'])")).filter((n) => !n.hasAttribute("disabled"));
      if (!nodes.length) return;
      const firstN = nodes[0], lastN = nodes[nodes.length - 1];
      if (!e.shiftKey && document.activeElement === lastN) { e.preventDefault(); firstN.focus(); }
      else if (e.shiftKey && document.activeElement === firstN) { e.preventDefault(); lastN.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 缓慢自转（低动效系统设置下不转）
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let raf = 0; let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(50, t - last); last = t;
      if (!dragging.current) setSpin((s) => s + dt * 0.00028);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const setPart = (key: string, color: string) => setParts((p) => ({ ...p, [key]: color.toLowerCase() }));
  const resetPart = () => {
    const def = partDefs.find((p) => p.key === activePart);
    if (def) setPart(activePart, def.def.toLowerCase());
  };
  return (
    <div className="diy-mask" role="dialog" aria-modal="true" aria-label={`DIY 工作台：${labelOf(item.kind)}`}>
      <div className="diy-card" ref={cardRef}>
        <div className="diy-head">
          <b>DIY 工作台</b>
          <span className="diy-sub">{labelOf(item.kind)}</span>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="取消并返回">取消</button>
        </div>
        <div className="diy-body">
          <div className="diy-preview" onPointerDown={(e) => { dragging.current = { x: e.clientX, spin }; }}
            onPointerMove={(e) => { if (dragging.current) setSpin(dragging.current.spin + (e.clientX - dragging.current.x) * 0.01); }}
            onPointerUp={() => { dragging.current = null; }} onPointerLeave={() => { dragging.current = null; }}>
            <Preview kind={item.kind} stage={stage} parts={parts} spin={spin} />
            <span className="diy-preview-hint">拖动可旋转预览</span>
          </div>
          <div className="diy-panel">
            <div className="diy-parts" role="tablist" aria-label="颜色分区">
              {partDefs.map((p) => (
                <button key={p.key} role="tab" aria-selected={activePart === p.key} className={`diy-part ${activePart === p.key ? "is-active" : ""}`} onClick={() => setActivePart(p.key)}>
                  <span className="diy-swatch" style={{ background: parts[p.key] }} />
                  {p.label}
                </button>
              ))}
            </div>
            <div className="diy-current">当前部位：<b>{partDefs.find((p) => p.key === activePart)?.label}</b></div>
            <div className="diy-presets" aria-label="预设配色">
              {PRESETS.map((row, i) => (
                <button key={i} className="diy-preset" onClick={() => {
                  const ps = Object.keys(parts);
                  const next = { ...parts };
                  ps.forEach((k, idx) => { next[k] = row[idx % row.length].toLowerCase(); });
                  setParts(next);
                }} aria-label={`预设配色 ${i + 1}`}>
                  {row.map((c) => <span key={c} style={{ background: c }} />)}
                </button>
              ))}
            </div>
            {STAGE_KINDS.includes(item.kind) && (
              <label className="diy-stage">外观阶段
                <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="装饰花外观阶段">
                  {STAGES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <small className="diy-note">只影响这朵装饰花的外观；知识植物的阶段由学习证据决定，不能在 DIY 里伪装开花</small>
              </label>
            )}
            <label className="diy-custom">
              自定义颜色
              <input type="color" value={parts[activePart] ?? "#C56E6E"} onChange={(e) => setPart(activePart, e.target.value)} aria-label="自定义当前部位颜色" />
            </label>
            <button className="btn btn-quiet btn-sm" onClick={resetPart}>恢复本部位默认色</button>
          </div>
        </div>
        <div className="diy-foot">
          <span className="diy-note">应用只改这一个对象；可用「撤销」回滚</span>
          <button className="btn btn-quiet btn-sm" onClick={onCancel}>取消</button>
          <button className="btn btn-quiet btn-sm" onClick={() => onSaveVariant?.(parts)} title="存成个人配色变体，新放置同类素材时默认复用">保存为素材变体</button>
          <button className="btn btn-primary btn-sm" onClick={() => onApply(parts, STAGE_KINDS.includes(item.kind) ? stage : undefined)}>应用</button>
        </div>
      </div>
    </div>
  );
}
