"use client";
/** 资料温室：上传（校验 → 提取 → 版本 → 分块 → 索引）、版本与片段查看、候选概念确认、阅读记录 */
import React, { useEffect, useRef, useState } from "react";
import { api, fmtTime } from "@/lib/api";
import { useSpace } from "../context";
import { loc } from "./ChatPanel";

const STATUS: Record<string, { label: string; cls: string }> = {
  ready: { label: "已解析", cls: "sage" }, processing: { label: "处理中", cls: "gold" }, needs_ocr: { label: "需要 OCR", cls: "rose" },
  unsupported: { label: "仅元数据", cls: "" }, failed: { label: "解析失败", cls: "rose" },
};
const KIND: Record<string, string> = { slides: "课件", notes: "讲义/笔记", exercises: "习题", textbook: "教材", other: "其他" };

export function MaterialsPanel() {
  const { panel, setPanelPatch } = useSpace();
  return panel.materialId ? <MaterialDetail id={panel.materialId} versionNo={panel.versionNo ?? undefined} chunkId={panel.chunkId ?? undefined} onBack={() => setPanelPatch({ materialId: null, versionNo: null, chunkId: null })} /> : <MaterialList />;
}

function MaterialList() {
  const { open, space, toast } = useSpace();
  const [list, setList] = useState<any[] | null>(null);
  const [up, setUp] = useState({ title: "", subjectId: space.subjects[0]?.id ?? "", kind: "notes", materialId: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api<any[]>("/api/materials").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f); fd.set("title", up.title); fd.set("subjectId", up.subjectId); fd.set("kind", up.kind);
    if (up.materialId) fd.set("materialId", up.materialId);
    setBusy(true); setErr(null); setResult(null);
    try { const r = await api("/api/materials", { form: fd }); setResult(r); load(); if (fileRef.current) fileRef.current.value = ""; }
    catch (e: any) { setErr(e.message); toast(e.message, "error"); } finally { setBusy(false); }
  };

  const mine = (list ?? []).filter((m) => !m.isPublic);
  return (
    <div className="panel-body">
      <div className="section">
        <h3>上传资料</h3>
        <form className="card stack" onSubmit={upload}>
          <input ref={fileRef} type="file" className="input" accept=".txt,.md,.markdown,.pdf,.pptx,.docx,.xlsx,.png,.jpg" required aria-label="选择文件" />
          <div className="row">
            <input className="input grow" placeholder="标题（默认使用文件名）" value={up.title} onChange={(e) => setUp({ ...up, title: e.target.value })} />
            <select className="select" style={{ width: "auto" }} value={up.kind} onChange={(e) => setUp({ ...up, kind: e.target.value })} aria-label="资料类型">
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="row">
            <select className="select grow" value={up.subjectId} onChange={(e) => setUp({ ...up, subjectId: e.target.value })} aria-label="学科">
              {space.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="select grow" value={up.materialId} onChange={(e) => setUp({ ...up, materialId: e.target.value })} aria-label="作为新资料或新版本">
              <option value="">作为新资料</option>
              {mine.map((m) => <option key={m.id} value={m.id}>作为《{m.title}》的新版本</option>)}
            </select>
          </div>
          <p className="small muted" style={{ margin: 0 }}>支持 TXT、Markdown、文本型 PDF（保存页码）、PPTX（保存页号）。扫描件会标记为需要 OCR；其它类型只保存元数据，不会假装已解析。上限 10 MB。</p>
          <div className="row"><button className="btn btn-primary" disabled={busy}>{busy ? "正在提取与分块…" : "上传并解析"}</button></div>
          {err && <p className="err">{err}</p>}
          {result && <p className={result.status === "ready" ? "note" : "err"}>v{result.versionNo}：{STATUS[result.status]?.label}。{result.detail}</p>}
        </form>
      </div>
      <div className="section">
        <h3>资料（课程公共资料 + 我的资料）</h3>
        {!list && <p className="muted small">加载中…</p>}
        {list?.map((m) => (
          <button key={m.id} className="card clickable" onClick={() => open({ panel: "materials", materialId: m.id })}>
            <div className="row"><b className="grow">{m.title}</b><span className={`chip ${STATUS[m.status]?.cls}`}>{STATUS[m.status]?.label}</span></div>
            <div className="small muted">{m.subjectName} · {KIND[m.kind]} · {m.fileType.toUpperCase()} · v{m.versionNo}（共 {m.versionCount} 版）· {m.chunkCount} 个片段 · {m.isPublic ? "课程公共" : "个人"} · {fmtTime(m.uploadedAt)}</div>
            {m.status !== "ready" && <div className="small" style={{ color: "var(--rose-ink)" }}>{m.statusDetail}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function MaterialDetail({ id, versionNo, chunkId, onBack }: { id: string; versionNo?: number; chunkId?: string; onBack: () => void }) {
  const { onGrowth, toast, space } = useSpace();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState<number | undefined>(versionNo);
  const box = useRef<HTMLDivElement>(null);
  const load = () => api(`/api/materials/${id}${v ? `?v=${v}` : ""}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { setV(versionNo); }, [versionNo]);
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, v]);
  useEffect(() => { if (d && chunkId) document.getElementById(`chunk-${chunkId}`)?.scrollIntoView({ block: "center" }); }, [d, chunkId]);

  const setConcept = async (conceptId: string, status: "confirmed" | "rejected") => {
    try { await api("/api/materials/concepts", { body: { versionId: d.version.id, conceptId, status } }); load(); } catch (e: any) { toast(e.message, "error"); }
  };
  const read = async (conceptId: string) => {
    try { const r = await api<any>("/api/materials/read", { body: { versionId: d.version.id, conceptId } }); onGrowth(r.events); } catch (e: any) { toast(e.message, "error"); }
  };
  if (err) return <div className="panel-body"><p className="err">{err}</p><button className="btn btn-ghost" onClick={onBack}>返回</button></div>;
  if (!d) return <div className="panel-body"><p className="muted">加载中…</p></div>;
  const latest = d.versions[0]?.versionNo;
  const planted = new Set(space.plants.map((p) => p.conceptId));
  return (
    <div className="panel-body" ref={box}>
      <button className="btn btn-quiet btn-sm" onClick={onBack}>‹ 全部资料</button>
      <h3 style={{ marginTop: 8, fontSize: 18 }}>{d.material.title}</h3>
      <div className="small muted">{d.material.subjectName} · {d.material.isPublic ? "课程公共资料" : "个人资料"}</div>
      <div className="row" style={{ margin: "10px 0" }}>
        {d.versions.map((x: any) => (
          <button key={x.id} className={`chip ${x.versionNo === d.version?.versionNo ? "mist" : ""}`} style={{ cursor: "pointer" }} onClick={() => setV(x.versionNo)}>
            v{x.versionNo}{x.versionNo === latest ? "（最新）" : ""} · {STATUS[x.status]?.label}
          </button>
        ))}
      </div>
      {d.version && (
        <div className="card small">
          <div>文件：{d.version.fileName}（{d.version.fileType.toUpperCase()}，{(d.version.byteSize / 1024).toFixed(1)} KB）</div>
          <div>上传：{fmtTime(d.version.uploadedAt)} · SHA-256 {d.version.sha256.slice(0, 12)}…</div>
          <div>处理：{d.version.statusDetail}</div>
          {d.version.versionNo !== latest && <div style={{ color: "var(--gold-ink)" }}>这是旧版本。旧回答的引用仍然指向它，新的检索只使用最新版本。</div>}
          {d.citedByMyMessages > 0 && <div>我的回答中引用过这个版本 {d.citedByMyMessages} 次。</div>}
        </div>
      )}
      {d.concepts.length > 0 && (
        <div className="section" style={{ marginTop: 14 }}>
          <h3>提取到的候选知识点</h3>
          {d.concepts.map((c: any) => (
            <div key={c.id} className="row" style={{ marginBottom: 4 }}>
              <span className={`chip ${c.status === "confirmed" ? "sage" : c.status === "rejected" ? "" : "gold"}`}>{c.status === "candidate" ? "候选 · " : c.status === "rejected" ? "已排除 · " : ""}{c.name} · 命中 {c.hitCount}</span>
              {!d.material.isPublic && c.status === "candidate" && <><button className="btn btn-quiet btn-sm" onClick={() => setConcept(c.id, "confirmed")}>确认</button><button className="btn btn-quiet btn-sm" onClick={() => setConcept(c.id, "rejected")}>排除</button></>}
              {c.status === "confirmed" && planted.has(c.id) && <button className="btn btn-quiet btn-sm" onClick={() => read(c.id)} title="记为“阅读资料”证据">我读过这部分</button>}
            </div>
          ))}
        </div>
      )}
      <div className="section">
        <h3>内容片段 <span className="small muted">{d.chunks.length} 个</span></h3>
        {d.chunks.length === 0 && <p className="muted small">没有可引用的文本内容。</p>}
        {d.chunks.map((c: any) => (
          <div key={c.id} id={`chunk-${c.id}`} className="card" style={c.id === chunkId ? { boxShadow: "0 0 0 3px rgba(215,183,121,.7)" } : undefined}>
            <div className="small muted">#{c.ord} · {loc({ fileType: d.version.fileType, pageNo: c.pageNo, paragraphNo: c.paragraphNo })}{c.heading ? ` · ${c.heading}` : ""}{c.id === chunkId ? " · 被引用的片段" : ""}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{c.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
