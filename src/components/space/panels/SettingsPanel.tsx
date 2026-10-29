"use client";
/** 设置：低动效、渲染方式（3D / 2.5D）、时区；模型模式与智能体工具清单（只读展示） */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSpace } from "../context";
import { SKY_THEMES, setSkyTheme, useSkyTheme } from "@/lib/sky";
import { DECOR_CATALOG, DECOR_LOAD_CAP, DECOR_PRESETS, loadOf, presetLoad, totalLoad, useDecor } from "@/lib/decor";

const PERM: Record<string, string> = { read_own: "只读本人数据", propose: "只提建议", write_rules: "后端规则写入（模型不可直接调用）" };

export function SettingsPanel() {
  const { space, reload, toast } = useSpace();
  const skyTheme = useSkyTheme();
  const decorStore = useDecor();
  const decorLoad = totalLoad(decorStore.decor);
  const [tools, setTools] = useState<any[]>([]);
  useEffect(() => { api<any[]>("/api/agent/tools").then(setTools).catch(() => {}); }, []);
  const set = async (p: any) => { try { await api("/api/me/preferences", { body: p }); await reload(); } catch (e: any) { toast(e.message, "error"); } };
  return (
    <div className="panel-body">
      <div className="section card stack">
        <h3>显示</h3>
        <label className="row"><input type="checkbox" checked={space.user.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} />低动效（关闭镜头动画、入场动画、花瓣展开与光点）</label>
        <label className="field"><span>星球渲染</span>
          <select className="select" value={space.user.renderMode} onChange={(e) => set({ renderMode: e.target.value })}>
            <option value="auto">自动（WebGL 可用时使用 3D）</option><option value="3d">3D（WebGL）</option><option value="2d">静态绘本（SVG，最省电）</option>
          </select>
        </label>
        <label className="field"><span>时区（用于历史检索的日期范围）</span>
          <select className="select" value={space.user.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {["Asia/Taipei", "Asia/Shanghai", "Asia/Tokyo", "America/Los_Angeles", "America/New_York", "Europe/London", "UTC"].map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
      </div>
      <div className="section card">
        <h3>天空</h3>
        <div className="row">
          {SKY_THEMES.map((t) => (
            <button key={t.key} className={`chip ${skyTheme === t.key ? "mist" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSkyTheme(t.key)} title={t.hint}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="small muted">天空主题目前存在本机浏览器；跨设备同步需要后端加字段（A 的 `users.sky_theme`）。</p>
      </div>
      <div className="section card">
        <h3>星球装饰</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {DECOR_PRESETS.map((p) => {
            const full = decorLoad + presetLoad(p) > DECOR_LOAD_CAP;
            return (
              <button key={p.key} className="btn btn-soft btn-sm" disabled={full} title={full ? "这个星球太满啦" : "一键布置"}
                onClick={() => decorStore.applyPreset(p)}>· {p.label}</button>
            );
          })}
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
          {DECOR_CATALOG.map((c) => {
            const full = decorLoad + loadOf(c.kind) > DECOR_LOAD_CAP;
            return (
              <button key={c.kind} className="btn btn-ghost btn-sm" disabled={full} title={full ? "这个星球太满啦" : undefined}
                onClick={() => decorStore.add(c.kind)}>＋ {c.label}</button>
            );
          })}
          {decorStore.decor.length > 0 && <button className="btn btn-quiet btn-sm" onClick={() => decorStore.reset()}>清空</button>}
        </div>
        <div className={`load-bar ${decorLoad >= DECOR_LOAD_CAP ? "full" : ""}`} role="img" aria-label={`装饰负荷 ${decorLoad} / ${DECOR_LOAD_CAP}`}>
          <i style={{ width: `${Math.min(100, (decorLoad / DECOR_LOAD_CAP) * 100)}%` }} />
        </div>
        <p className="small muted">
          负荷 {decorLoad} / {DECOR_LOAD_CAP}
          {decorLoad >= DECOR_LOAD_CAP ? "（这个星球太满啦）" : "（每件装饰有负荷，太满会掉帧）"}
        </p>
        {decorStore.decor.length === 0 && <p className="small muted">还没有装饰。加一盏路灯或一棵小树，你的星球就和别人不一样了。</p>}
        {decorStore.decor.map((d) => (
          <div key={d.id} className="row small" style={{ marginTop: 6, flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <b className="grow">{DECOR_CATALOG.find((c) => c.kind === d.kind)?.label}</b>
            <button className="btn btn-ghost btn-sm" aria-label="左移" onClick={() => decorStore.update(d.id, { x: d.x - 0.08 })}>←</button>
            <button className="btn btn-ghost btn-sm" aria-label="右移" onClick={() => decorStore.update(d.id, { x: d.x + 0.08 })}>→</button>
            <button className="btn btn-ghost btn-sm" aria-label="前移" onClick={() => decorStore.update(d.id, { z: d.z - 0.08 })}>↑</button>
            <button className="btn btn-ghost btn-sm" aria-label="后移" onClick={() => decorStore.update(d.id, { z: d.z + 0.08 })}>↓</button>
            <button className="btn btn-ghost btn-sm" aria-label="左转" onClick={() => decorStore.update(d.id, { rot: d.rot - 15 })}>↺</button>
            <button className="btn btn-ghost btn-sm" aria-label="右转" onClick={() => decorStore.update(d.id, { rot: d.rot + 15 })}>↻</button>
            <button className="btn btn-ghost btn-sm" aria-label="放大" onClick={() => decorStore.update(d.id, { scale: Math.min(1.6, d.scale + 0.1) })}>＋</button>
            <button className="btn btn-ghost btn-sm" aria-label="缩小" onClick={() => decorStore.update(d.id, { scale: Math.max(0.6, d.scale - 0.1) })}>－</button>
            <button className="btn btn-ghost btn-sm" aria-label="移除" onClick={() => decorStore.remove(d.id)}>✕</button>
          </div>
        ))}
        <p className="small muted">原型：装饰位置存在本机浏览器；接 A 的 `/api/decor` 后可跨设备，也能开放「参观别人的星球」。</p>
      </div>
      <div className="section card">
        <h3>大模型</h3>
        <p className="small">{space.llm.note}</p>
        <p className="small muted">在服务端 .env 中配置 LLM_MODE、LLM_BASE_URL、LLM_MODEL、LLM_API_KEY。Key 只保存在服务端，不会下发到浏览器。</p>
      </div>
      <div className="section">
        <h3>星灯的工具</h3>
        <p className="small muted">主智能体按“识别请求 → 读取上下文 → 检索 → 回答或出题 → 收集作答 → 校验 → 后端保存证据”运行。模型不能执行任意 SQL，也不能修改学习状态。</p>
        {tools.map((t) => (
          <div key={t.name} className="card small">
            <div className="row"><b className="mono grow">{t.name}</b><span className="chip">{PERM[t.permission]}</span><span className="chip">超时 {t.timeoutMs / 1000}s</span>{t.modelCallable && <span className="chip mist">模型可调用</span>}</div>
            <div>{t.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
