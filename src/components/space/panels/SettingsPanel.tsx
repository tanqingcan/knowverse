"use client";
/** 设置：低动效、渲染方式（3D / 2.5D）、时区；模型模式与智能体工具清单（只读展示） */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSpace } from "../context";
import { SKY_THEMES, setSkyTheme, useSkyTheme } from "@/lib/sky";

const PERM: Record<string, string> = { read_own: "只读本人数据", propose: "只提建议", write_rules: "后端规则写入（模型不可直接调用）" };

export function SettingsPanel() {
  const { space, reload, toast } = useSpace();
  const skyTheme = useSkyTheme();
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
