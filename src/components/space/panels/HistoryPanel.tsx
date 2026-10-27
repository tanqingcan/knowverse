"use client";
/**
 * 历史问答组合检索（课程必选主线）：关键词 + 起止日期 + 知识点 + 学科 → 分页结果 → 定位原消息 → 继续提问
 * 过滤全部在服务端完成，并带本人权限条件。
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSpace } from "../context";
import { useConcepts } from "../hooks";

type Seg = { text: string; hit: boolean };
type Hit = {
  questionId: string; answerId: string | null; conversationId: string; conversationTitle: string; origin: string; localDate: string;
  titleSegs: Seg[]; questionSegs: Seg[]; answerSummary: string; answerSegs: Seg[] | null; answerStatus: string | null; matchedIn: string[];
  concepts: { id: string; name: string; status: string }[];
};
type Result = { hits: Hit[]; total: number; page: number; pageSize: number; pages: number; timezone: string };

const Segs = ({ segs }: { segs: Seg[] }) => <>{segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</>;
const MATCHED: Record<string, string> = { title: "标题", question: "问题", answer: "回答" };

// 面板关闭再打开时保留上次的检索条件（会话内）
let lastForm: { keyword: string; from: string; to: string; conceptIds: string[]; subjectId: string } | null = null;

export function HistoryPanel() {
  const { open, space, panel } = useSpace();
  const { concepts } = useConcepts();
  const [form, setForm] = useState(lastForm ?? { keyword: "", from: "", to: "", conceptIds: [] as string[], subjectId: "" });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickConcept, setPickConcept] = useState(false);

  useEffect(() => { if (panel.conceptId) setForm((f) => ({ ...f, conceptIds: [panel.conceptId!] })); }, [panel.conceptId]);

  const search = async (p = 1) => {
    setBusy(true); setErr(null);
    if (form.from && form.to && form.from > form.to) { setErr("开始日期不能晚于结束日期"); setBusy(false); return; }
    try {
      const r = await api<Result>("/api/history/search", { body: {
        keyword: form.keyword || undefined, from: form.from || undefined, to: form.to || undefined,
        conceptIds: form.conceptIds.length ? form.conceptIds : undefined, subjectId: form.subjectId || undefined, page: p, pageSize: 8,
      } });
      setRes(r); setPage(p); lastForm = form;
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { search(1); /* 打开时先列出最近的问答 */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.conceptId]);

  const toggleConcept = (id: string) => setForm((f) => ({ ...f, conceptIds: f.conceptIds.includes(id) ? f.conceptIds.filter((x) => x !== id) : [...f.conceptIds, id] }));
  const selected = concepts.filter((c) => form.conceptIds.includes(c.id));

  return (
    <div className="panel-body">
      <form className="search-form" onSubmit={(e) => { e.preventDefault(); search(1); }} aria-label="历史问答检索">
        <label className="field full"><span>关键词（会话标题、问题和回答正文）</span>
          <input className="input" value={form.keyword} maxLength={80} onChange={(e) => setForm({ ...form, keyword: e.target.value })} placeholder="例如：LEFT JOIN、条件概率" />
        </label>
        <label className="field"><span>开始日期</span><input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
        <label className="field"><span>结束日期（含当天）</span><input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
        <label className="field"><span>学科</span>
          <select className="select" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
            <option value="">全部学科</option>
            {space.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="field"><span>知识点</span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => setPickConcept(!pickConcept)} aria-expanded={pickConcept}>
            {selected.length ? selected.map((c) => c.name).join("、") : "选择知识点（可多选）"}
          </button>
        </div>
        {pickConcept && (
          <div className="full concept-picker" role="group" aria-label="知识点筛选">
            {concepts.filter((c) => !form.subjectId || c.subjectId === form.subjectId).map((c) => (
              <button type="button" key={c.id} className="chip" aria-pressed={form.conceptIds.includes(c.id)} onClick={() => toggleConcept(c.id)}>{c.name}</button>
            ))}
          </div>
        )}
        <div className="full row">
          <button className="btn btn-primary" disabled={busy}>{busy ? "检索中…" : "检索"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { const f = { keyword: "", from: "", to: "", conceptIds: [], subjectId: "" }; setForm(f); lastForm = f; setTimeout(() => search(1)); }}>清空条件</button>
          <span className="small muted grow" style={{ textAlign: "right" }}>日期按 {res?.timezone ?? space.user.timezone} 自然日计算，含起止两天</span>
        </div>
      </form>
      <div className="divider" />
      {err && <p className="err">{err}</p>}
      {res && (
        <>
          <p className="small muted" aria-live="polite">共 {res.total} 组问答{res.total ? `，第 ${res.page}/${res.pages} 页` : ""}</p>
          {res.hits.length === 0 && <div className="empty">没有符合条件的问答。可以放宽日期或换一个关键词。</div>}
          {res.hits.map((h) => (
            <button key={h.questionId} className="card clickable hit" onClick={() => open({ panel: "chat", conversationId: h.conversationId, messageId: h.questionId })} aria-label={`打开原问题：${h.questionSegs.map((s) => s.text).join("")}`}>
              <div className="row">
                <span className="t grow"><Segs segs={h.titleSegs} /></span>
                {h.origin === "seed" && <span className="chip gold">预置</span>}
                <span className="small muted">{h.localDate}</span>
              </div>
              <div className="q">问：<Segs segs={h.questionSegs} /></div>
              <div className="a">{h.answerSegs ? <>答（匹配片段）：<Segs segs={h.answerSegs} /></> : <>答（摘要）：{h.answerSummary || (h.answerStatus === "failed" ? "（生成失败）" : "（无）")}</>}</div>
              <div className="row" style={{ marginTop: 6 }}>
                {h.concepts.map((c) => <span key={c.id} className={`chip ${c.status === "confirmed" ? "sage" : ""}`}>{c.status === "candidate" ? "候选 · " : ""}{c.name}</span>)}
                {h.matchedIn.length > 0 && <span className="small muted">命中：{h.matchedIn.map((x) => MATCHED[x]).join("、")}</span>}
              </div>
            </button>
          ))}
          {res.pages > 1 && (
            <div className="pager">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1 || busy} onClick={() => search(page - 1)}>上一页</button>
              <span>第 {page} / {res.pages} 页</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= res.pages || busy} onClick={() => search(page + 1)}>下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
