"use client";
/** 学习卡：由真实问答与笔记起草（草稿需用户修改确认），保存为版本，可发布到班级 */
import React, { useEffect, useState } from "react";
import { api, fmtTime } from "@/lib/api";
import { Markdown } from "@/components/ui/Markdown";
import { useSpace } from "../context";

export function CardsPanel() {
  const { panel, setPanelPatch, space, toast, open } = useSpace();
  const [cards, setCards] = useState<any[] | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [edit, setEdit] = useState<{ cardId?: string; conceptId: string; title: string; body: string; changeNote: string; draftedBy: "user" | "ai_draft"; sourceMessageIds: string[]; basedOn?: string } | null>(null);
  const [history, setHistory] = useState<{ id: string; rows: any[] } | null>(null);
  const load = () => api<any[]>("/api/cards").then(setCards).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); api<any[]>("/api/classes").then(setClasses).catch(() => {}); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (panel.draft && panel.conceptId) {
      api<any>("/api/cards/draft", { body: { conceptId: panel.conceptId } }).then((d) => {
        setEdit({ conceptId: panel.conceptId!, title: d.title, body: d.body, changeNote: "初版", draftedBy: "ai_draft", sourceMessageIds: d.sourceMessageIds, basedOn: d.basedOn });
        setPanelPatch({ draft: null });
      }).catch((e) => toast(e.message, "error"));
    }
  }, [panel.draft, panel.conceptId, setPanelPatch, toast]);

  const save = async () => {
    if (!edit) return;
    try { await api("/api/cards", { body: edit }); setEdit(null); load(); toast("学习卡已保存为新版本"); } catch (e: any) { toast(e.message, "error"); }
  };
  const publish = async (versionId: string, classId: string) => {
    try { await api("/api/cards/publish", { body: { versionId, classId } }); load(); toast("已发布到班级（旧的公开版本会被替换，记录保留）"); } catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <div className="panel-body">
      {edit ? (
        <div className="section stack">
          <h3>{edit.cardId ? "修订学习卡" : "新学习卡"}</h3>
          {edit.draftedBy === "ai_draft" && <p className="note">这是根据你的真实问答与笔记自动整理的草稿（{edit.basedOn}）。请改成自己的话再保存。</p>}
          <label className="field"><span>标题</span><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
          <label className="field"><span>内容（Markdown）</span><textarea className="textarea" rows={10} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value, draftedBy: "user" })} /></label>
          <label className="field"><span>修订说明</span><input className="input" value={edit.changeNote} onChange={(e) => setEdit({ ...edit, changeNote: e.target.value })} /></label>
          <div className="row"><button className="btn btn-primary" onClick={save}>保存版本</button><button className="btn btn-ghost" onClick={() => setEdit(null)}>取消</button></div>
        </div>
      ) : (
        <div className="row section">
          <span className="grow small muted">从植物档案点击“整理学习卡”，或选择一株花起草：</span>
          <select className="select" style={{ width: "auto" }} defaultValue="" onChange={(e) => e.target.value && setPanelPatch({ conceptId: e.target.value, draft: "1" })} aria-label="选择植物起草学习卡">
            <option value="">选择植物…</option>
            {space.plants.map((p) => <option key={p.id} value={p.conceptId}>{p.conceptName}</option>)}
          </select>
        </div>
      )}
      {!cards && <p className="muted">加载中…</p>}
      {cards?.length === 0 && !edit && <div className="empty">还没有学习卡。</div>}
      {cards?.map((c) => (
        <div key={c.id} className="card section">
          <div className="row"><b className="grow">{c.title}</b><span className="chip">v{c.versionNo}</span><span className="chip sage">{c.conceptName}</span></div>
          <div className="small muted">{fmtTime(c.updatedAt)} · {c.changeNote}{c.draftedBy === "ai_draft" ? " · 未修改的自动草稿" : ""}</div>
          <div style={{ marginTop: 6 }}><Markdown text={c.body} /></div>
          {c.sources.length > 0 && <div className="row small">来源问答：{c.sources.map((s: any, i: number) => <button key={s.messageId} className="btn btn-quiet btn-sm" onClick={() => open({ panel: "chat", conversationId: s.conversationId, messageId: s.messageId })}>原问题 {i + 1}</button>)}</div>}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ cardId: c.id, conceptId: c.conceptId, title: c.title, body: c.body, changeNote: "", draftedBy: "user", sourceMessageIds: c.sources.map((s: any) => s.messageId) })}>修订</button>
            <button className="btn btn-quiet btn-sm" onClick={async () => setHistory(history?.id === c.id ? null : { id: c.id, rows: await api(`/api/cards/${c.id}/history`) })}>版本历史</button>
            {classes.map((cl) => <button key={cl.id} className="btn btn-quiet btn-sm" onClick={() => publish(c.versionId, cl.id)}>发布 v{c.versionNo} 到「{cl.name}」</button>)}
            {c.publications.map((p: any) => <span key={p.classId} className="chip gold">已公开 v{p.versionNo} · {p.className}</span>)}
          </div>
          {history && history.id === c.id && history.rows.map((h) => <div key={h.id} className="small" style={{ borderTop: "1px dashed var(--line)", paddingTop: 4, marginTop: 4 }}>v{h.versionNo} · {fmtTime(h.createdAt)} · {h.changeNote}（{h.draftedBy === "ai_draft" ? "自动草稿" : "本人编辑"}）</div>)}
        </div>
      ))}
    </div>
  );
}
