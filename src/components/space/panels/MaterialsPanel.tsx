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

type CourseConcept = { id: string; name: string; subjectName: string };
type Passage = { chunkId: string; materialId: string; materialTitle: string; versionNo: number; location: string;
  heading: string | null; content: string; status: string; source: string };
type ChunkLink = { id: string; name: string; source: string; status: string; matchedTerm: string | null };

function ConceptPassages() {
  const { panel, open, setPanelPatch } = useSpace();
  const [catalog, setCatalog] = useState<CourseConcept[]>([]);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [error, setError] = useState("");
  const conceptId = panel.conceptId ?? "";

  useEffect(() => {
    api<CourseConcept[]>("/api/concepts").then(setCatalog).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!conceptId) return;
    let active = true;
    setPassages(null);
    setError("");
    api<Passage[]>(`/api/materials/chunk-concepts?conceptId=${encodeURIComponent(conceptId)}`)
      .then(rows => { if (active) setPassages(rows); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [conceptId]);

  return <div className="section">
    <div className="row">
      <select className="select grow" aria-label="按知识点查教材片段" value={conceptId} onChange={e => setPanelPatch({ conceptId: e.target.value || null })}>
        <option value="">按知识点查教材片段</option>
        {catalog.map(k => <option key={k.id} value={k.id}>{k.subjectName} · {k.name}</option>)}
      </select>
      {conceptId && <button className="btn btn-quiet" onClick={() => open({ panel: "history", conceptId })}>查相关问答</button>}
    </div>
    {error && <p className="err">{error}</p>}
    {conceptId && !error && (
      passages === null ? <p className="small muted">正在查找片段…</p> :
      passages.length === 0 ? <p className="small muted">当前教材没有关联片段。可以在资料详情中添加。</p> :
      <div className="stack" style={{ marginTop: 8 }}>
        {passages.map(hit => <button key={hit.chunkId} className="card clickable" onClick={() =>
          open({ panel: "materials", conceptId, materialId: hit.materialId, versionNo: hit.versionNo, chunkId: hit.chunkId })}>
          <b>{hit.materialTitle} · v{hit.versionNo} · {hit.location}</b>
          <div className="small muted">{hit.status === "confirmed" ? "已确认" : "候选"}{hit.heading ? ` · ${hit.heading}` : ""}</div>
          <div className="small">{hit.content.slice(0, 120)}{hit.content.length > 120 ? "…" : ""}</div>
        </button>)}
      </div>
    )}
  </div>;
}

function MaterialList() {
  const { open, space } = useSpace();
  const [list, setList] = useState<any[] | null>(null);
  const [up, setUp] = useState({ title: "", subjectId: space.subjects[0]?.id ?? "", kind: "notes", materialId: "" });
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"personal" | "public">("personal");
  const [fileCount, setFileCount] = useState(0);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<{ name: string; ok: boolean; message: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api<any[]>("/api/materials").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length || (up.materialId && files.length !== 1)) return;
    setBusy(true); setErr(null); setResults([]); setScope("personal");
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`正在处理 ${index + 1}/${files.length}`);
        const fd = new FormData();
        fd.set("file", file); fd.set("subjectId", up.subjectId); fd.set("kind", up.kind);
        if (files.length === 1) fd.set("title", up.title);
        if (up.materialId) fd.set("materialId", up.materialId);
        try {
          const r = await api<{ status: string; versionNo: number; detail: string }>("/api/materials", { form: fd });
          const state = STATUS[r.status]?.label ?? r.status;
          setResults(rows => [...rows, { name: file.name, ok: r.status !== "failed", message: `v${r.versionNo} · ${state}。${r.detail}` }]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "上传失败";
          setResults(rows => [...rows, { name: file.name, ok: false, message }]);
        }
      }
      if (fileRef.current) fileRef.current.value = "";
      setFileCount(0);
      await load();
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const mine = (list ?? []).filter((m) => !m.isPublic);
  const publicSamples = (list ?? []).filter(m => m.isPublic);
  return (
    <div className="panel-body">
      <ConceptPassages />
      <div className="section">
        <h3>上传资料</h3>
        <form className="card stack" onSubmit={upload}>
          <input ref={fileRef} type="file" className="input" accept=".txt,.md,.markdown,.pdf,.pptx,.docx,.xlsx,.png,.jpg"
            disabled={busy} multiple={!up.materialId} required aria-label="选择文件" onChange={e => setFileCount(e.target.files?.length ?? 0)} />
          <div className="row">
            <input className="input grow" placeholder={fileCount > 1 ? "多文件按文件名命名" : "标题（默认使用文件名）"} value={fileCount > 1 ? "" : up.title}
              disabled={busy || fileCount > 1 || !!up.materialId} onChange={(e) => setUp({ ...up, title: e.target.value })} />
            <select className="select" style={{ width: "auto" }} value={up.kind} onChange={(e) => setUp({ ...up, kind: e.target.value })} aria-label="资料类型">
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="row">
            <select className="select grow" value={up.subjectId} onChange={(e) => setUp({ ...up, subjectId: e.target.value })} aria-label="学科">
              {space.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="select grow" value={up.materialId} disabled={busy || fileCount > 1} onChange={(e) => setUp({ ...up, materialId: e.target.value })} aria-label="作为新资料或新版本">
              <option value="">作为新资料</option>
              {mine.map((m) => <option key={m.id} value={m.id}>作为《{m.title}》的新版本</option>)}
            </select>
          </div>
          <p className="small muted" style={{ margin: 0 }}>上传的文件仅本人可见。可以一次选择多份新资料，单个文件最多 10 MB。TXT、Markdown、文本 PDF 和 PPTX 可以提取正文，扫描件会标记为需要 OCR。</p>
          <div className="row"><button className="btn btn-primary" disabled={busy || !up.subjectId}>{busy ? progress : "上传并解析"}</button></div>
          {err && <p className="err">{err}</p>}
          <div aria-live="polite">
            {results.map((row, i) => <p key={i} className={row.ok ? "note" : "err"}><b>{row.name}</b> · {row.message}</p>)}
          </div>
        </form>
      </div>
      <div className="section">
        <div className="row" role="group" aria-label="资料范围">
          <button className={scope === "personal" ? "btn btn-primary" : "btn btn-quiet"} type="button" aria-pressed={scope === "personal"} onClick={() => setScope("personal")}>我的资料</button>
          <button className={scope === "public" ? "btn btn-primary" : "btn btn-quiet"} type="button" aria-pressed={scope === "public"} onClick={() => setScope("public")}>课程公共示例</button>
        </div>
        {!list && <p className="muted small">加载中…</p>}
        {list && (scope === "personal" ? mine : publicSamples).length === 0 && <p className="muted small">{scope === "personal" ? "还没有上传资料。" : "当前没有公共示例。"}</p>}
        {(scope === "personal" ? mine : publicSamples).map((m) => (
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
  const [tagChunkId, setTagChunkId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CourseConcept[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const load = () => api(`/api/materials/${id}${v ? `?v=${v}` : ""}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { setV(versionNo); }, [versionNo]);
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, v]);
  useEffect(() => { if (d && chunkId) document.getElementById(`chunk-${chunkId}`)?.scrollIntoView({ block: "center" }); }, [d, chunkId]);
  const subjectId = d?.material.subjectId;
  useEffect(() => {
    if (subjectId && !d.material.isPublic) api<CourseConcept[]>(`/api/concepts?subjectId=${subjectId}`)
      .then(setCatalog).catch(e => toast(e.message, "error"));
    // toast is supplied by the space panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const setConcept = async (conceptId: string, status: "confirmed" | "rejected") => {
    try { await api("/api/materials/concepts", { body: { versionId: d.version.id, conceptId, status } }); load(); } catch (e: any) { toast(e.message, "error"); }
  };
  const reviewChunk = async (id: string, conceptId: string, status: "confirmed" | "rejected") => {
    try {
      await api("/api/materials/chunk-concepts", { body: { chunkId: id, conceptId, status } });
      setTagChunkId(null);
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    }
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
      <button className="btn btn-quiet btn-sm" onClick={onBack}>‹ 返回资料</button>
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
          {d.version.versionNo !== latest && <div style={{ color: "var(--gold-ink)" }}>旧回答的引用仍指向当时版本，新检索使用最新已解析版本。</div>}
          {d.version.status !== "processing" && <a className="btn btn-quiet btn-sm" href={`/api/materials/${id}/file?v=${d.version.versionNo}`} download>下载 v{d.version.versionNo} 原文件</a>}
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
            <div className="stack" style={{ marginTop: 6 }}>
              {(c.conceptLinks as ChunkLink[]).map(link => <div key={link.id} className="row">
                <span className={link.status === "confirmed" ? "chip sage" : "chip"} title={link.matchedTerm ? `目录匹配 ${link.matchedTerm}` : "用户添加"}>
                  {link.name} · {link.status === "confirmed" ? "已确认" : link.status === "rejected" ? "已排除" : "候选"}
                </span>
                {!d.material.isPublic && link.status !== "confirmed" && <button className="btn btn-quiet btn-sm" onClick={() => reviewChunk(c.id, link.id, "confirmed")}>确认片段标签</button>}
                {!d.material.isPublic && link.status !== "rejected" && <button className="btn btn-quiet btn-sm" onClick={() => reviewChunk(c.id, link.id, "rejected")}>排除片段标签</button>}
              </div>)}
              {!d.material.isPublic && catalog.length > 0 && (tagChunkId === c.id ?
                <select className="select" aria-label="添加片段知识点" value="" onChange={e => {
                  if (e.target.value) reviewChunk(c.id, e.target.value, "confirmed");
                }}>
                  <option value="">选择同学科知识点</option>
                  {catalog.filter(k => !(c.conceptLinks as ChunkLink[]).some(link => link.id === k.id)).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select> :
                <button className="btn btn-quiet btn-sm" onClick={() => setTagChunkId(c.id)}>添加片段知识点</button>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
