"use client";
/**
 * 首次进入：远处的小星球 → 镜头缓慢靠近 → 长椅、灯和一小块空花圃 → 提问 → 进入/登录
 * 开场可跳过；已登录的老用户由服务端直接送回上次的上下文。
 */
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api, ApiError } from "@/lib/api";

const StaticGarden = dynamic(() => import("@/components/world/StaticGarden").then((m) => m.StaticGarden), { ssr: false });

type Phase = "far" | "near" | "question" | "auth";

export function Landing() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("far");
  const [reduced, setReduced] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ handle: "", displayName: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(rm);
    if (rm) { setPhase("question"); return; }
    const t1 = setTimeout(() => setPhase("near"), 400);
    const t2 = setTimeout(() => setPhase((p) => (p === "near" ? "question" : p)), 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const go = async (fn: () => Promise<unknown>, to: string) => {
    setBusy(true); setErr(null);
    try { await fn(); router.replace(to); router.refresh(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "出了点问题，请重试"); setBusy(false); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register") go(() => api("/api/auth/register", { body: form }), "/welcome");
    else go(() => api("/api/auth/login", { body: { handle: form.handle, password: form.password } }), "/space");
  };

  return (
    <main className={`intro ${reduced ? "reduced-motion" : ""}`}>
      <div className="sky" aria-hidden="true" />
      {phase !== "question" && phase !== "auth" && (
        <button className="btn btn-ghost btn-sm skip" onClick={() => setPhase("question")}>跳过开场</button>
      )}
      <div className={`intro-scene ${phase === "far" ? "far" : "near"}`} aria-hidden="true">
        <StaticGarden plants={[]} gardens={[{ name: "" }]} pose="idle" signText="" reduced={reduced} />
      </div>
      <div className="intro-veil" aria-hidden="true" />

      <div className={`intro-copy ${phase === "question" || phase === "auth" ? "" : "hidden"}`} >
        <div className="tag">知屿 · KNOWVERSE</div>
        {phase === "question" && (
          <>
            <p className="q">如果你有一颗自己的星球，<br />你想在上面种下什么？</p>
            <div className="intro-actions">
              <button className="btn btn-primary" onClick={() => { setMode("register"); setPhase("auth"); }}>种下第一颗种子</button>
              <button className="btn btn-ghost" onClick={() => { setMode("login"); setPhase("auth"); }}>回到我的星球</button>
            </div>
            <div className="intro-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => go(() => api("/api/auth/demo", { body: { account: "demo" } }), "/space")}>以演示账号进入（含预置历史）</button>
              <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => go(() => api("/api/auth/demo", { body: { account: "fresh" } }), "/welcome")}>体验新旅人开场</button>
            </div>
            {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
          </>
        )}
        {phase === "auth" && (
          <form className="auth-card paper" onSubmit={submit} aria-label={mode === "register" ? "注册" : "登录"}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 className="grow" style={{ margin: 0 }}>{mode === "register" ? "认领一颗星球" : "回到我的星球"}</h2>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "已有账号" : "新建账号"}</button>
            </div>
            <div className="stack">
              <label className="field"><span>登录名</span><input className="input" autoComplete="username" required value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="小写字母或数字，3–32 位" /></label>
              {mode === "register" && <label className="field"><span>怎么称呼你</span><input className="input" value={form.displayName} maxLength={24} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="例如：小屿" /></label>}
              <label className="field"><span>密码</span><input className="input" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 6 : 1} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              {err && <p className="err">{err}</p>}
              <div className="row">
                <button className="btn btn-primary" disabled={busy}>{busy ? "请稍候…" : mode === "register" ? "开始" : "进入"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setPhase("question")}>返回</button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>演示账号：demo / knowverse（预置历史均标注“预置”）。</p>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
