"use client";
/**
 * 个性化答疑：消息持久化、资料引用（版本 + 页码/段落）、候选知识点标签（可修正）、失败重试、定位原消息继续提问
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, fmtTime } from "@/lib/api";
import { Markdown } from "@/components/ui/Markdown";
import { GuideOrb } from "@/components/art/Props";
import { useSpace } from "../context";
import { useConcepts } from "../hooks";

type Citation = { messageId: string; ref: string; quote: string; ord: number; chunkId: string; pageNo: number | null; paragraphNo: number | null; versionId: string; versionNo: number; fileType: string; materialId: string; materialTitle: string };
type Tag = { messageId: string; conceptId: string; name: string; status: "candidate" | "confirmed" | "rejected"; source: string };
type Msg = {
  id: string; seq: number; role: "user" | "assistant"; content: string; status: "pending" | "complete" | "failed"; mode: string | null; basis: string | null;
  replyToId: string | null; errorMessage: string | null; createdAt: string; model: string | null; provider: string | null; latencyMs: number | null;
  citations: Citation[]; tags: Tag[]; suggestions: { id: string; name: string }[];
};
type Win = { conversation: { id: string; title: string; origin: string; subjectId: string | null; subjectName: string | null; focusConceptId: string | null; focusConceptName: string | null }; hasEarlier: boolean; messages: Msg[] };

const BASIS: Record<string, { label: string; cls: string; tip: string }> = {
  materials: { label: "资料依据", cls: "mist", tip: "回答依据检索到的资料片段" },
  mixed: { label: "资料 + 通用知识", cls: "mist", tip: "部分依据资料，部分为通用知识" },
  general: { label: "通用知识", cls: "gold", tip: "资料中没有找到对应片段，依据通用知识回答" },
  insufficient: { label: "依据不足", cls: "rose", tip: "资料与通用知识都不足以可靠回答" },
};

export function loc(c: { fileType: string; pageNo: number | null; paragraphNo: number | null }) {
  if (c.pageNo != null) return c.fileType === "pptx" ? `第 ${c.pageNo} 页幻灯片` : `第 ${c.pageNo} 页`;
  if (c.paragraphNo != null) return `第 ${c.paragraphNo} 段`;
  return "全文";
}

export function ChatPanel() {
  const { panel, setPanelPatch, open, onGrowth, toast, space, setBusy } = useSpace();
  const { concepts } = useConcepts();
  const [win, setWin] = useState<Win | null>(null);
  const [list, setList] = useState<any[] | null>(null);
  // H42：会话历史默认折叠（标题/按钮里再展开），不再一进来就占掉窗口 1/3
  const [showList, setShowList] = useState(false);
  // H48：未发送的草稿要跨「关窗/开窗」保留（面板卸载不丢）——按会话 id 存 localStorage
  const draftKey = `kv-chat-draft:${panel.conversationId ?? "new"}`;
  const [text, setText] = useState<string>(() => {
    try { return (typeof localStorage !== "undefined" && localStorage.getItem(draftKey)) || ""; } catch { return ""; }
  });
  const setDraft = (v: string) => {
    setText(v);
    try {
      if (typeof localStorage !== "undefined") {
        if (v) localStorage.setItem(draftKey, v); else localStorage.removeItem(draftKey);
      }
    } catch { /* 隐私模式忽略 */ }
  };
  const [sending, setSending] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focusConcept, setFocusConcept] = useState<string>(panel.conceptId ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const located = panel.messageId;

  const loadList = () => api<any[]>("/api/conversations").then(setList).catch(() => setList([]));
  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (!panel.conversationId) { setWin(null); setShowList(false); return; }
    setErr(null);
    const qs = panel.messageId ? `?around=${panel.messageId}` : "";
    api<Win>(`/api/conversations/${panel.conversationId}${qs}`).then((w) => { setWin(w); setTitle(w.conversation.title); setShowList(false); })
      .catch((e) => setErr(e.message));
  }, [panel.conversationId, panel.messageId]);

  useEffect(() => { if (panel.conceptId) setFocusConcept(panel.conceptId); }, [panel.conceptId]);

  // 定位：滚动到原消息；否则滚到底部
  useLayoutEffect(() => {
    if (!win || !boxRef.current) return;
    if (located) {
      const el = boxRef.current.querySelector(`[data-mid="${located}"]`);
      if (el) { el.scrollIntoView({ block: "center" }); return; }
    }
    boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [win, located, pendingText]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setBusy(true); setErr(null); setPendingText(t); setDraft("");
    try {
      const r = await api<Win & { growth: any[] }>("/api/chat", { body: { conversationId: win?.conversation.id ?? null, text: t, focusConceptId: (!win && focusConcept) ? focusConcept : (focusConcept || null) } });
      setWin(r); setTitle(r.conversation.title);
      if (r.conversation.id !== panel.conversationId) setPanelPatch({ conversationId: r.conversation.id, messageId: null });
      else if (panel.messageId) setPanelPatch({ messageId: null });
      onGrowth(r.growth);
      loadList();
      const last = r.messages[r.messages.length - 1];
      if (last?.status === "failed") toast(`回答生成失败：${last.errorMessage}`, "error");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "发送失败"); setDraft(t); // 失败把内容放回输入框，可直接重试
    } finally { setSending(false); setBusy(false); setPendingText(null); }
  };

  const retry = async (id: string) => {
    setSending(true);
    try {
      const r = await api<Win & { growth: any[] }>(`/api/messages/${id}/retry`, { method: "POST" });
      setWin(r); onGrowth(r.growth);
    } catch (e: any) { toast(e.message, "error"); } finally { setSending(false); }
  };

  const setTag = async (m: Msg, conceptId: string, status: "confirmed" | "rejected") => {
    try {
      const r = await api<{ growth: any[] }>(`/api/messages/${m.id}/tags`, { body: { conceptId, status } });
      onGrowth(r.growth);
      const w = await api<Win>(`/api/conversations/${win!.conversation.id}${located ? `?around=${located}` : ""}`); setWin(w);
    } catch (e: any) { toast(e.message, "error"); }
  };

  const suggestion = async (sid: string, action: "accept" | "dismiss") => {
    try {
      const r = await api<any>(`/api/suggestions/${sid}`, { body: { action, subjectId: win?.conversation.subjectId ?? undefined } });
      if (action === "accept") { onGrowth(r.growth); toast("已建立个人知识点，并标记到这条问题上"); }
      const w = await api<Win>(`/api/conversations/${win!.conversation.id}`); setWin(w);
    } catch (e: any) { toast(e.message, "error"); }
  };

  const onKv = (href: string) => {
    const m = href.match(/^kv:\/\/message\/([\w-]+)\/([\w-]+)/);
    if (m) { open({ panel: "chat", conversationId: m[1], messageId: m[2] }); return; }
    const p = href.match(/^kv:\/\/practice\/([\w-]+)(?:\?mode=(\w+))?/);
    if (p) open({ panel: "practice", taskVersionId: p[1], mode: p[2] ?? "guided" });
  };

  const openCite = (c: Citation) => open({ panel: "materials", materialId: c.materialId, versionNo: c.versionNo, chunkId: c.chunkId });

  const saveTitle = async () => {
    setEditingTitle(false);
    if (!win || !title.trim() || title === win.conversation.title) return;
    await api(`/api/conversations/${win.conversation.id}`, { method: "PATCH", body: { title } }).catch(() => {});
    loadList();
  };

  const loadEarlier = async () => {
    if (!win) return;
    const first = win.messages[0]?.seq;
    const w = await api<Win>(`/api/conversations/${win.conversation.id}?before=${first}`);
    setWin({ ...win, hasEarlier: w.hasEarlier, messages: [...w.messages, ...win.messages] });
  };

  const focusName = concepts.find((c) => c.id === focusConcept)?.name;
  const msgs = win?.messages ?? [];
  const locatedMsg = located ? msgs.find((m) => m.id === located) : null;

  return (
    <div className="chat">
      <div className="chat-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => setShowList(!showList)} aria-expanded={showList}>会话列表{list ? ` · ${list.length}` : ""}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setPanelPatch({ conversationId: null, messageId: null }); setWin(null); setShowList(false); }}>新对话</button>
        {win && !editingTitle && <button className="btn btn-quiet btn-sm grow" style={{ justifyContent: "flex-start", overflow: "hidden", fontWeight: 600 }} onClick={() => setEditingTitle(true)} title="点击重命名">{win.conversation.title}</button>}
        {win && editingTitle && <input className="input grow" style={{ padding: "3px 8px" }} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && saveTitle()} />}
        {win?.conversation.origin === "seed" && <span className="chip gold" title="演示账号的预置历史">预置</span>}
      </div>

      {showList && (
        <div className="conv-list">
          {!list && <p className="muted small">加载中…</p>}
          {list?.length === 0 && <p className="muted small">还没有会话。问星灯第一个问题吧。</p>}
          {list?.map((c) => (
            <button key={c.id} className="plant-row" style={{ color: "var(--ink)" }} aria-current={c.id === win?.conversation.id} onClick={() => { open({ panel: "chat", conversationId: c.id }); setShowList(false); }}>
              <span className="name">{c.title}</span>
              {c.origin === "seed" && <span className="chip gold">预置</span>}
              <span className="stage-label" style={{ color: "var(--ink-3)" }}>{fmtTime(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}

      {locatedMsg && (
        <div className="locate-banner note"><span className="lamp-line">你上次的问题，在这里。</span><span>{fmtTime(locatedMsg.createdAt)} 的原消息已高亮，前后文都保留着；继续提问会接在这个会话里。</span>
          <button className="btn btn-quiet btn-sm" onClick={() => setPanelPatch({ messageId: null })}>取消高亮</button></div>
      )}

      <div className="msgs" ref={boxRef}>
        {err && <p className="err">{err}</p>}
        {!win && !pendingText && (
          <div className="empty">
            <div className="float" style={{ display: "inline-block" }}><GuideOrb size={56} /></div>
            <p style={{ margin: "8px 0 4px", color: "var(--ink)" }}>想聊哪一株花？或者直接问我任何学科的问题。</p>
            <p className="small">回答会尽量依据你的资料，并标出版本和页码；资料不足时我会说明。</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
              {["LEFT JOIN 之后把右表条件写在 WHERE 里，为什么结果像内连接？", "P(A|B) 和 P(B|A) 有什么区别？", "根据我的记录给我出几道题"].map((s) => (
                <button key={s} className="chip" style={{ cursor: "pointer" }} onClick={() => setDraft(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {win?.hasEarlier && <div style={{ textAlign: "center", marginBottom: 10 }}><button className="btn btn-ghost btn-sm" onClick={loadEarlier}>加载更早的消息</button></div>}
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} data-mid={m.id} className={`msg user ${m.id === located ? "focused" : ""}`}>
            <div style={{ maxWidth: "100%", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div className="bubble">{m.content}</div>
              <div className="msg-tags">
                {m.tags.filter((t) => t.status !== "rejected").map((t) => (
                  <span key={t.conceptId} className={`chip ${t.status === "confirmed" ? "sage" : ""}`} title={t.status === "confirmed" ? "已确认的知识点" : "AI 候选标签：确认或移除"}>
                    {t.status === "candidate" && "候选 · "}{t.name}
                    {t.status === "candidate" && <button aria-label={`确认标签 ${t.name}`} onClick={() => setTag(m, t.conceptId, "confirmed")}>✓</button>}
                    <button aria-label={`移除标签 ${t.name}`} onClick={() => setTag(m, t.conceptId, "rejected")}>✕</button>
                  </span>
                ))}
                {m.suggestions.map((s) => (
                  <span key={s.id} className="chip mist" title="AI 提出的新概念；不会自动建立">新概念？{s.name}
                    <button aria-label={`建立知识点 ${s.name}`} onClick={() => suggestion(s.id, "accept")}>建立</button>
                    <button aria-label={`忽略 ${s.name}`} onClick={() => suggestion(s.id, "dismiss")}>✕</button>
                  </span>
                ))}
                <AddTag onAdd={(cid) => setTag(m, cid, "confirmed")} exclude={m.tags.filter((t) => t.status !== "rejected").map((t) => t.conceptId)} subjectId={win?.conversation.subjectId ?? null} />
              </div>
              <div className="meta">{fmtTime(m.createdAt)}</div>
            </div>
          </div>
        ) : (
          <div key={m.id} data-mid={m.id} className={`msg assistant ${m.id === located ? "focused" : ""}`}>
            <GuideOrb size={30} thinking={m.status === "pending"} />
            <div className="body">
              {m.status === "pending" && <div className="thinking">星灯正在读资料与你的记录…</div>}
              {m.status === "failed" && (
                <div className="err">回答没有生成成功：{m.errorMessage}
                  <div style={{ marginTop: 6 }}><button className="btn btn-ghost btn-sm" disabled={sending} onClick={() => retry(m.id)}>重试</button></div>
                </div>
              )}
              {m.status === "complete" && (
                <>
                  <Markdown text={m.content} onKvLink={onKv} onRef={(ref) => { const c = m.citations.find((x) => x.ref === ref); if (c) openCite(c); }} />
                  {m.citations.length > 0 && (
                    <div className="cite-list" aria-label="资料引用">
                      {m.citations.map((c) => (
                        <button key={c.chunkId} className="cite" onClick={() => openCite(c)} title={c.quote}>
                          <b>{c.ref}</b><span>《{c.materialTitle}》v{c.versionNo} · {loc(c)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="meta">
                    {m.basis && <span className={`chip ${BASIS[m.basis]?.cls}`} title={BASIS[m.basis]?.tip}>{BASIS[m.basis]?.label}</span>}
                    {m.mode === "demo" && <span className="chip gold" title="演示模式：固定演示逻辑 + 真实检索，未调用大模型">演示回答</span>}
                    <span>{fmtTime(m.createdAt)}</span>
                  </div>
                  <details className="more">
                    <summary>查看详情</summary>
                    <div className="more-body">
                      <div>依据：{m.basis ? BASIS[m.basis]?.tip : "未标注"}</div>
                      <div>{m.mode === "demo" ? "演示模式：回答来自固定演示逻辑与真实的资料检索，没有调用大模型。" : `模型：${m.model ?? "未知"}${m.provider ? `（${m.provider}）` : ""}${m.latencyMs ? `，耗时 ${(m.latencyMs / 1000).toFixed(1)} 秒` : ""}`}</div>
                      <div>引用 {m.citations.length} 条；消息编号 #{m.seq}</div>
                    </div>
                  </details>
                  <AssistantActions m={m} q={msgs.find((x) => x.id === m.replyToId)} focusConceptId={focusConcept || win?.conversation.focusConceptId || null} />
                </>
              )}
            </div>
          </div>
        ))}
        {pendingText && (
          <>
            <div className="msg user"><div className="bubble">{pendingText}</div></div>
            <div className="msg assistant"><GuideOrb size={30} thinking /><div className="thinking">星灯正在读资料与你的记录…</div></div>
          </>
        )}
      </div>

      <div className="composer">
        <div className="ctx">
          <label className="small muted" htmlFor="focus-concept">围绕知识点</label>
          <select id="focus-concept" className="select" style={{ width: "auto", padding: "2px 8px", fontSize: 13 }} value={focusConcept} onChange={(e) => setFocusConcept(e.target.value)}>
            <option value="">（不指定，自动识别）</option>
            {space.plants.map((p) => <option key={p.id} value={p.conceptId}>{p.conceptName}</option>)}
          </select>
          {focusName && <span className="small muted">提问会记为「{focusName}」的学习记录</span>}
        </div>
        <div className="box">
          <label className="sr-only" htmlFor="chat-input">输入问题</label>
          <textarea id="chat-input" className="textarea" rows={2} value={text} maxLength={4000} placeholder={win ? "继续提问…（Enter 发送，Shift+Enter 换行）" : "问星灯一个问题…"}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button className="btn btn-primary" disabled={sending || !text.trim()} onClick={send}>{sending ? "…" : "发送"}</button>
        </div>
      </div>
    </div>
  );
}

function AddTag({ onAdd, exclude, subjectId }: { onAdd: (id: string) => void; exclude: string[]; subjectId: string | null }) {
  const { concepts } = useConcepts();
  const [open, setOpen] = useState(false);
  const opts = useMemo(() => concepts.filter((c) => !exclude.includes(c.id) && (!subjectId || c.subjectId === subjectId)), [concepts, exclude, subjectId]);
  if (!open) return <button className="chip" style={{ cursor: "pointer" }} onClick={() => setOpen(true)} aria-label="添加知识点标签">＋ 标签</button>;
  return (
    <select className="select" autoFocus style={{ width: 160, padding: "1px 6px", fontSize: 12.5 }} defaultValue="" onBlur={() => setOpen(false)}
      onChange={(e) => { if (e.target.value) onAdd(e.target.value); setOpen(false); }} aria-label="选择知识点">
      <option value="">选择知识点…</option>
      {opts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function AssistantActions({ m, q, focusConceptId }: { m: Msg; q?: Msg; focusConceptId: string | null }) {
  const { open, onGrowth, toast } = useSpace();
  const [noting, setNoting] = useState(false);
  const confirmed = q?.tags.find((t) => t.status === "confirmed")?.conceptId ?? focusConceptId;
  const [conceptId, setConceptId] = useState(confirmed ?? "");
  const [note, setNote] = useState("");
  const { concepts } = useConcepts();
  useEffect(() => { setConceptId(confirmed ?? ""); }, [confirmed]);
  const save = async () => {
    try {
      const r = await api<{ growth: any[] }>("/api/notes", { body: { conceptId, title: (q?.content ?? "笔记").slice(0, 30), content: note, sourceMessageId: q?.id ?? null } });
      setNoting(false); setNote(""); onGrowth(r.growth); toast("笔记已保存到植物档案");
    } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <>
      <div className="actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setNoting(!noting)}>写成笔记</button>
        <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "practice", conceptId: confirmed ?? null })}>做练习</button>
        {confirmed && <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "cards", conceptId: confirmed, draft: "1" })}>整理学习卡</button>}
      </div>
      {noting && (
        <div className="card" style={{ marginTop: 8 }}>
          <label className="field"><span>归属知识点</span>
            <select className="select" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
              <option value="">请选择</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.subjectName} · {c.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginTop: 8 }}><span>用自己的话写下要点</span>
            <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="笔记会作为“学习记录”证据，让对应的植物发芽" />
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!conceptId || !note.trim()} onClick={save}>保存笔记</button>
            <button className="btn btn-quiet btn-sm" onClick={() => setNoting(false)}>取消</button>
          </div>
        </div>
      )}
    </>
  );
}
