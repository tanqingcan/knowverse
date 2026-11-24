"use client";
/**
 * 首次进入：星空中的悬浮小岛由远及近 → 标题与入口出现 → 进入/登录
 * 开场可跳过；已登录的老用户由服务端直接送回上次的上下文。
 */
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

/** 金色线描图标（24×24，描边） */
const ICONS: Record<string, React.ReactNode> = {
  book: <><path d="M3 6.5c3-1.4 6-1.4 9 .5 3-1.9 6-1.9 9-.5V19c-3-1.4-6-1.4-9 .5-3-1.9-6-1.9-9-.5Z" /><path d="M12 7v12.5" /><path d="M12 1.5l.7 1.6 1.6.7-1.6.7L12 6.1l-.7-1.6-1.6-.7 1.6-.7Z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></>,
  dome: <><path d="M5 20V12a7 7 0 0 1 14 0v8" /><path d="M3.5 20h17" /><path d="M12 18v-4" /><path d="M12 15c-2.2 0-3-1.6-3-3 1.8 0 3 .9 3 3Zm0-1c1.6 0 2.4-1.2 2.4-2.4-1.4 0-2.4.8-2.4 2.4Z" /><circle cx="12" cy="3.4" r=".9" /></>,
  target: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.4" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" /></>,
};
const FEATURES = [
  { icon: "book", name: "个性化答疑" },
  { icon: "search", name: "历史问答检索" },
  { icon: "dome", name: "资料温室" },
  { icon: "target", name: "薄弱点练习" },
];

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

  const login = () => { setMode("login"); setPhase("auth"); };
  const shown = phase === "question" || phase === "auth";

  return (
    <main className={`intro intro-landing ${reduced ? "reduced-motion" : ""}`}>
      {/* 背景插画（已去掉原图中的文字与按钮，文案全部由网页实时渲染） */}
      <div className={`intro-art ${phase === "far" ? "far" : ""}`} aria-hidden="true" />
      <div className="intro-shade" aria-hidden="true" />

      <header className="intro-nav">
        <div className="intro-brand">
          <svg viewBox="0 0 64 40" width={58} height={36} aria-hidden="true"><ellipse cx="30" cy="22" rx="26" ry="9" fill="none" stroke="#E8C987" strokeWidth="1.6" transform="rotate(-18 30 22)" /><path d="M30 8 L 33 19 L 44 22 L 33 25 L 30 36 L 27 25 L 16 22 L 27 19Z" fill="#F4E2B5" /></svg>
          <div><b>知屿</b><small>KNOWVERSE</small></div>
        </div>
        <span className="intro-nav-line" aria-hidden="true" />
        <nav aria-label="入口">
          <button onClick={login}>星球漫游</button><i aria-hidden="true">/</i>
          <button onClick={login}>我的花园</button><i aria-hidden="true">/</i>
          <button onClick={login}>资料温室</button>
          <button className="intro-nav-login" onClick={login}>登录</button>
        </nav>
      </header>

      {phase !== "question" && phase !== "auth" && (
        <button className="btn btn-ghost btn-sm skip" onClick={() => setPhase("question")}>跳过开场</button>
      )}

      <div className={`intro-copy ${shown ? "" : "hidden"}`} >
        <div className="intro-eyebrow"><span aria-hidden="true">✦</span>让好奇心，有处生长<span aria-hidden="true">✦</span></div>
        {phase === "question" && (
          <>
            <h1 className="q"><span>在自己的星球，</span><br /><span>种下整个宇宙。</span></h1>
            <p className="intro-lede">每一次提问，都是一颗种子。<br />让知识生根，让好奇心开花。</p>
            <ul className="intro-features" aria-label="主要功能">
              {FEATURES.map((f) => (
                <li key={f.name}><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[f.icon]}</svg>{f.name}</li>
              ))}
            </ul>
            <div className="intro-actions">
              <button className="btn-ornate is-primary" onClick={() => { setMode("register"); setPhase("auth"); }}>种下第一颗种子<span aria-hidden="true">→</span></button>
              <button className="btn-ornate" onClick={login}>回到我的星球</button>
            </div>
            <div className="intro-demo">
              <span className="intro-demo-label">课堂演示</span>
              <button className="intro-link" disabled={busy} onClick={() => go(() => api("/api/auth/demo", { body: { account: "demo" } }), "/space")}>以演示账号进入 →</button>
              <button className="intro-link is-quiet" disabled={busy} onClick={() => go(() => api("/api/auth/demo", { body: { account: "fresh" } }), "/welcome")}>体验新旅人开场</button>
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

      <footer className="intro-foot" aria-hidden="true">
        <span>YOUR CURIOSITY, YOUR UNIVERSE</span><i />
      </footer>
    </main>
  );
}
