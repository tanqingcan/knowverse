"use client";
/**
 * B4 记忆面板：展示星灯沉淀的长期记忆（事实 / 偏好 / 事件），
 * 支持修正（原记录保留为修正历史）与遗忘（软删除），并可跳转到产生这条记忆的原对话消息。
 */
import React, { useEffect, useState } from "react";
import { api, fmtTime } from "@/lib/api";
import { useSpace } from "../context";

type Memory = {
  id: string; kind: "fact" | "preference" | "event"; content: string;
  conceptId: string | null; conceptName: string | null;
  sourceMessageId: string | null; sourceConversationId: string | null;
  status: string; createdAt: string; updatedAt: string;
  sourceMessage: string | null; sourceMessageRole: string | null; sourceMessageSeq: number | null;
  sourceMessageCreatedAt: string | null; sourceConversationTitle: string | null;
};

const KIND: Record<string, { label: string; cls: string }> = {
  fact: { label: "事实", cls: "sage" },
  preference: { label: "偏好", cls: "gold" },
  event: { label: "事件", cls: "mist" },
};

export function MemoryPanel() {
  const { open, toast } = useSpace();
  const [list, setList] = useState<Memory[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");

  const load = () => api<Memory[]>("/api/memories").then(setList).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const del = async (m: Memory) => {
    if (!window.confirm(`确定遗忘这条记忆吗？\n「${m.content.slice(0, 40)}${m.content.length > 40 ? "…" : ""}」`)) return;
    try { await api(`/api/memories/${m.id}`, { method: "DELETE" }); load(); toast("已遗忘这条记忆"); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const startEdit = (m: Memory) => { setEditing(m.id); setText(m.content); };
  const saveEdit = async (m: Memory) => {
    if (!text.trim()) return;
    try {
      await api(`/api/memories/${m.id}`, { method: "PATCH", body: { content: text } });
      setEditing(null); setText(""); load(); toast("已修正记忆（原记录保留在修正历史中）");
    } catch (e: any) { toast(e.message, "error"); }
  };

  const jump = (m: Memory) => {
    if (!m.sourceConversationId || !m.sourceMessageId) { toast("这条记忆没有可定位的来源消息", "error"); return; }
    open({ panel: "chat", conversationId: m.sourceConversationId, messageId: m.sourceMessageId });
  };

  return (
    <div className="panel-body">
      <p className="small muted">星灯在对话中记住的关于你的「事实 / 偏好 / 事件」。可以修正内容，或点「来源」回到产生它的原对话消息。</p>
      {!list && <p className="muted">加载中…</p>}
      {list?.length === 0 && <div className="empty">还没有任何记忆。多和星灯聊聊，它会把值得记住的内容沉淀在这里。</div>}
      {list?.map((m) => (
        <div key={m.id} className="card section">
          <div className="row">
            <span className={`chip ${KIND[m.kind]?.cls ?? ""}`}>{KIND[m.kind]?.label ?? m.kind}</span>
            {m.conceptName && <span className="chip sage">{m.conceptName}</span>}
            <span className="grow" />
            <span className="small muted">{fmtTime(m.updatedAt)}</span>
          </div>
          {editing === m.id ? (
            <>
              <textarea className="textarea" rows={3} value={text} maxLength={8000} onChange={(e) => setText(e.target.value)} aria-label="修正记忆内容" />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => saveEdit(m)}>保存修正</button>
                <button className="btn btn-quiet btn-sm" onClick={() => { setEditing(null); setText(""); }}>取消</button>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(m)}>修正</button>
            <button className="btn btn-quiet btn-sm" onClick={() => del(m)}>遗忘</button>
            {m.sourceConversationId && m.sourceMessageId && (
              <button className="btn btn-quiet btn-sm" onClick={() => jump(m)}>来源：{m.sourceConversationTitle ?? "原对话"}</button>
            )}
          </div>
          {m.sourceMessage && (
            <div className="note" style={{ marginTop: 8 }}>
              <span className="lamp-line">来源引用</span>
              {m.sourceConversationTitle ? `　「${m.sourceConversationTitle}」` : ""}
              {m.sourceMessageCreatedAt ? ` · ${fmtTime(m.sourceMessageCreatedAt)}` : ""}
              {m.sourceMessageRole ? ` · ${m.sourceMessageRole === "user" ? "你的提问" : "星灯的回答"}` : ""}
              <div style={{ marginTop: 4, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>「{m.sourceMessage}」</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
