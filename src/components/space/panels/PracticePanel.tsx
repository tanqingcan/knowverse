"use client";
/** 个性化训练：依据真实记录选题 → 作答（提示会被记录）→ 规则/受限执行/公开维度评价 → 证据与成长（后端事务） */
import React, { useEffect, useRef, useState } from "react";
import { api, ApiError, newKey } from "@/lib/api";
import { Markdown } from "@/components/ui/Markdown";
import { STAGE_NAME, type StageKey } from "@/lib/flora";
import { useSpace } from "../context";
import { SqlEditor, SqlHighlight, formatSql } from "./SqlEditor";

const MODE: Record<string, { label: string; tip: string }> = {
  guided: { label: "引导练习", tip: "可以查看提示。结果记为“引导练习”，让植物生叶。" },
  independent: { label: "独立作答", tip: "不看提示独立完成。若使用提示，本次会改记为引导练习。没做过的变式题答对才会开花。" },
  diagnostic: { label: "诊断", tip: "了解起点，不预设薄弱点。" },
};
const VERDICT: Record<string, string> = { correct: "正确", partial: "部分满足", incorrect: "未通过", ungraded: "未评分" };
const KIND: Record<string, string> = { sql: "SQL", choice: "选择", numeric: "计算", open: "解释" };

export function PracticePanel() {
  const { panel, setPanelPatch, toast } = useSpace();
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!panel.taskVersionId || panel.attemptId) return;
    setStarting(true);
    api<any>("/api/practice/start", { body: { taskVersionId: panel.taskVersionId, mode: panel.mode ?? "guided" } })
      .then((v) => setPanelPatch({ attemptId: v.attempt.id, taskVersionId: null, mode: null }))
      .catch((e) => toast(e.message, "error")).finally(() => setStarting(false));
  }, [panel.taskVersionId, panel.attemptId, panel.mode, setPanelPatch, toast]);
  if (starting) return <div className="panel-body"><p className="muted">正在准备题目…</p></div>;
  if (panel.attemptId) return <Attempt id={panel.attemptId} />;
  return <Suggestions />;
}

function Suggestions() {
  const { panel, setPanelPatch, space, toast } = useSpace();
  const [gen, setGen] = useState(false);
  const generate = async () => {
    setGen(true);
    try { const r = await api<any>("/api/practice/generate", { body: { conceptId: panel.conceptId } }); toast(`星灯生成了新题《${r.title}》（AI 生成，已通过结构校验）`); setPanelPatch({ taskVersionId: r.taskVersionId, mode: "independent" }); }
    catch (e: any) { toast(e.message, "error"); } finally { setGen(false); }
  };
  const [s, setS] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const concept = space.plants.find((p) => p.conceptId === panel.conceptId);
  useEffect(() => {
    setS(null);
    api("/api/practice/suggest", { body: panel.conceptId ? { conceptId: panel.conceptId } : {} }).then(setS).catch((e) => setErr(e.message));
    api("/api/review").then(setReview).catch(() => {});
  }, [panel.conceptId]);
  const start = (tv: string, mode: string) => setPanelPatch({ taskVersionId: tv, mode });
  return (
    <div className="panel-body">
      <div className="row section">
        <span className="grow">{concept ? <>为「<b>{concept.conceptName}</b>」（{STAGE_NAME[concept.stage]}）选题</> : "根据你的全部记录选题"}</span>
        {panel.conceptId && <button className="btn btn-quiet btn-sm" onClick={() => setPanelPatch({ conceptId: null })}>看全部</button>}
      </div>
      {err && <p className="err">{err}</p>}
      {!s && !err && <p className="muted">正在根据记录选题…</p>}
      {s && (
        <div className="section">
          <p className="note">{s.explanation}</p>
          {s.picks.length === 0 && <div className="empty">暂时没有合适的题目。</div>}
          {panel.conceptId && (
            <div className="row" style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={gen || space.llm.mode !== "live"} onClick={generate}>{gen ? "正在生成…" : "让星灯针对这个知识点生成一道新变式"}</button>
              {space.llm.mode !== "live" && <span className="small muted">需要真实模式；演示模式只从题库选题</span>}
            </div>
          )}
          {s.picks.map((p: any) => (
            <div key={p.taskVersionId} className="card">
              <div className="row"><b className="grow">{p.title}</b><span className="chip">{KIND[p.kind]}</span>{p.isVariant && <span className="chip rose">变式</span>}{p.attempted && <span className="chip">做过</span>}</div>
              <div className="small" style={{ margin: "4px 0" }}>{p.conceptNames.join("、")} · {p.reason}</div>
              <div className="row">
                <button className="btn btn-primary btn-sm" onClick={() => start(p.taskVersionId, p.suggestedMode)}>{MODE[p.suggestedMode]?.label}开始</button>
                {p.suggestedMode !== "guided" && <button className="btn btn-ghost btn-sm" onClick={() => start(p.taskVersionId, "guided")}>先用引导模式</button>}
                {p.suggestedMode === "guided" && <button className="btn btn-ghost btn-sm" onClick={() => start(p.taskVersionId, "independent")}>直接独立作答</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {review && (
        <div className="section">
          <h3>待验证与待复习</h3>
          {review.review.length === 0 && <p className="small muted">现在没有需要回顾的知识点。</p>}
          {review.review.map((r: any) => (
            <button key={r.conceptId} className="card clickable" onClick={() => setPanelPatch({ conceptId: r.conceptId })}>
              <div className="row"><b className="grow">{r.conceptName}</b><span className={`chip ${r.kind === "to_verify" ? "rose" : "gold"}`}>{r.kind === "to_verify" ? "待验证（花苞）" : "可以复习了"}</span></div>
              <div className="small muted">{r.subjectName} · {STAGE_NAME[r.stage as StageKey]}{r.mistakes ? ` · 曾答错 ${r.mistakes} 次` : ""}</div>
            </button>
          ))}
          {review.ready?.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>先修已满足（先修至少生叶）的题目：{[...new Set(review.ready.map((x: any) => x.title))].slice(0, 6).join("、")}</p>}
        </div>
      )}
    </div>
  );
}

function Attempt({ id }: { id: string }) {
  const { setPanelPatch, onGrowth, toast } = useSpace();
  const [v, setV] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState<{ ord: number; content: string }[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey("submit")); // 同一次提交（含网络重试）复用同一个幂等键

  useEffect(() => {
    api<any>(`/api/attempts/${id}`).then((x) => {
      setV(x); setHints(x.hintsShown); if (x.attempt.answer) setAnswer(x.attempt.answer);
      if (x.evaluation) setResult({ evaluation: x.evaluation, evidence: [], growth: [], idempotentReplay: true });
    }).catch((e) => setErr(e.message));
  }, [id]);

  if (err && !v) return <div className="panel-body"><p className="err">{err}</p></div>;
  if (!v) return <div className="panel-body"><p className="muted">加载中…</p></div>;
  const spec = v.task.spec;
  const done = v.attempt.status === "evaluated" || !!result;

  const hint = async () => {
    try { const h = await api<any>(`/api/attempts/${id}/hint`, { method: "POST" }); setHints((x) => [...x, h]); }
    catch (e: any) { toast(e.message, "error"); }
  };
  const run = async () => {
    setPreviewErr(null); setPreview(null);
    try { setPreview(await api(`/api/attempts/${id}/run`, { body: { sql: answer } })); } catch (e: any) { setPreviewErr(e.message); }
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await api<any>(`/api/attempts/${id}/submit`, { body: { answer, submitKey: key.current } });
        setResult(r); setV({ ...v, attempt: { ...v.attempt, status: "evaluated" } });
        onGrowth(r.growth);
        break;
      } catch (e: any) {
        // 网络失败时用同一个幂等键重试一次；服务端保证只结算一次
        if (e instanceof ApiError && e.code === "network" && attempt === 0) continue;
        setErr(e.message);
        break;
      }
    }
    setBusy(false);
  };

  const usedHint = hints.length > 0;
  const isSql = spec.type === "sql";
  const canSubmit = !busy && !!answer.trim() && !done;

  /* 题目信息（SQL 题放左栏，其它题型照旧单栏） */
  const brief = (
    <>
      <button className="btn btn-quiet btn-sm" onClick={() => setPanelPatch({ attemptId: null })}>‹ 选题</button>
      <div className="row" style={{ margin: "8px 0" }}>
        <h3 className="grow pr-title" style={{ margin: 0 }}>{v.task.title}</h3>
        <span className="chip">{KIND[v.task.kind]}</span>{v.task.isVariant && <span className="chip rose">变式</span>}<span className="chip">v{v.task.versionNo}</span>
      </div>
      <div className="small muted">{v.concepts.map((c: any) => c.name).join("、")}{v.task.source === "ai_generated" ? " · AI 生成题目" : ""}</div>
      <p className="note" style={{ marginTop: 8 }}><b>{MODE[v.attempt.mode]?.label}</b>：{MODE[v.attempt.mode]?.tip}{v.attempt.mode === "independent" && usedHint ? " 你已使用提示，本次将记为引导练习。" : ""}</p>
      <div className="task-prompt card"><Markdown text={v.task.prompt} /></div>
      {v.task.datasetDoc && (
        <details className="pr-schema-box" open>
          <summary>表结构 · {v.task.datasetKey}<span className="muted">（独立的只读沙箱，与业务数据库隔离）</span></summary>
          {isSql ? <SqlHighlight code={v.task.datasetDoc} className="pr-schema" /> : <pre className="mono pr-schema">{v.task.datasetDoc}</pre>}
        </details>
      )}
      {hints.map((h) => <p key={h.ord} className="note pr-hint">💡 提示 {h.ord}：{h.content}</p>)}
    </>
  );

  /* 评价结果 */
  const verdictEl = result && (
    <div className="section pr-result" style={{ marginTop: 14 }}>
      <div className={`verdict ${result.evaluation.verdict}`}>{VERDICT[result.evaluation.verdict]}{result.evaluation.score != null && result.evaluation.verdict !== "correct" && result.evaluation.verdict !== "incorrect" ? `（${Math.round(result.evaluation.score * 100)}% 维度满足）` : ""}</div>
      <div className="card" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{result.evaluation.feedback}</div>
      {result.evaluation.rubric?.dimensions && (
        <div className="card">
          {result.evaluation.rubric.dimensions.map((d: any) => <div key={d.key} className="small">{d.met ? "✓" : "○"} <b>{d.name}</b>：{d.evidence}</div>)}
        </div>
      )}
      {result.evaluation.uncertainty && <p className="small muted">不确定之处：{result.evaluation.uncertainty}</p>}
      <p className="small muted">评价方式：{({ rule_sql: "在受限沙箱中执行并比对结果集", rule_choice: "选项规则", rule_numeric: "数值容差规则", rubric_llm: "模型按公开维度评价", rubric_demo: "演示模式关键词规则", seed: "预置" } as any)[result.evaluation.evaluator] ?? result.evaluation.evaluator}{result.idempotentReplay ? " · 已结算过（重复请求不会重复计入）" : ""}</p>
      {result.evidence?.length > 0 && (
        <div className="card">
          {result.evidence.map((e: any, i: number) => (
            <div key={i} className="small">「{e.conceptName}」记为 <b>{({ guided_practice: "引导练习", independent_attempt: "独立作答", independent_variant_pass: "独立变式通过" } as any)[e.kind]}</b>
              {e.fromStage !== e.toStage ? `，${STAGE_NAME[e.fromStage as StageKey]} → ${STAGE_NAME[e.toStage as StageKey]}` : `，阶段保持${STAGE_NAME[e.toStage as StageKey]}`}。{e.detail}</div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setPanelPatch({ attemptId: null })}>再练一道</button>
      </div>
    </div>
  );

  /* SQL 题：左题右码的工作台 */
  if (isSql) {
    return (
      <div className="panel-body pr-ide-wrap">
        <div className="pr-ide">
          <section className="pr-brief" aria-label="题目">{brief}</section>
          <section className="pr-work" aria-label="作答">
            <div className="pr-editor-card">
              <div className="pr-toolbar">
                <span className="pr-dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="pr-tool-title">answer.sql</span>
                <span className="pr-db"><b aria-hidden="true">●</b> {v.task.datasetKey ?? "sandbox"} · 只读沙箱</span>
                <span className="grow" />
                {!done && <button type="button" className="pr-tool-btn" disabled={!answer.trim()} onClick={() => setAnswer(formatSql(answer))} title="关键字大写、每个子句一行（不改变查询含义）">格式化</button>}
              </div>
              <SqlEditor value={answer} onChange={setAnswer} readOnly={done} minLines={14}
                onRun={() => { if (answer.trim() && !done) run(); }} onSubmit={() => { if (canSubmit) submit(); }} />
            </div>
            {!done && (
              <div className="pr-actions">
                <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>{busy ? "评价中…" : "提交"}</button>
                <button className="btn btn-ghost" disabled={!answer.trim()} onClick={run}>▶ 运行看看（不计入）</button>
                {v.hintTotal > hints.length && <button className="btn btn-ghost" onClick={hint}>看提示（{hints.length}/{v.hintTotal}）</button>}
                <span className="pr-keys"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 运行 · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> 提交</span>
              </div>
            )}
            {err && <p className="err">{err}</p>}
            {!done && (
              <div className="pr-output">
                <div className="pr-output-head">
                  <b>运行结果</b>
                  {preview && <span className="pr-ok">✓ 运行成功 · {preview.rowCount} 行{preview.truncated ? "（已截断）" : ""} · {preview.ms} ms</span>}
                  {previewErr && <span className="pr-bad">✕ 执行出错</span>}
                </div>
                {previewErr && <pre className="pr-error">{previewErr}</pre>}
                {preview && <SqlTable r={preview} />}
                {!preview && !previewErr && <p className="pr-empty">点“运行看看”或按 Ctrl+Enter，在只读沙箱里试运行，结果显示在这里，不计入成绩。</p>}
              </div>
            )}
            {verdictEl}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body">
      {brief}
      {!done && (
        <div className="stack" style={{ marginTop: 10 }}>
          {spec.type === "choice" && (
            <div role="radiogroup" aria-label="选项">
              {spec.options.map((o: any) => (
                <label key={o.key} className="option"><input type="radio" name="opt" value={o.key} checked={answer === o.key} onChange={() => setAnswer(o.key)} /><span><b>{o.key}.</b> {o.text}</span></label>
              ))}
            </div>
          )}
          {spec.type === "numeric" && <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="小数、分数或百分数，例如 0.18、9/50、18%" aria-label="数值答案" />}
          {spec.type === "open" && (
            <>
              <div className="small"><b>公开评价维度：</b>{spec.dimensions.map((d: any) => `${d.name}（${d.description}）`).join("；")}</div>
              <textarea className="textarea" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="用自己的话解释…" aria-label="解释答案" />
            </>
          )}
          <div className="row">
            <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>{busy ? "评价中…" : "提交"}</button>
            {v.hintTotal > hints.length && <button className="btn btn-ghost" onClick={hint}>看提示（{hints.length}/{v.hintTotal}）</button>}
          </div>
          {err && <p className="err">{err}</p>}
        </div>
      )}
      {verdictEl}
    </div>
  );
}

function SqlTable({ r }: { r: { columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean; ms: number } }) {
  return (
    <div className="pr-table-wrap">
      <table className="result-table">
        <thead><tr>{r.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>{r.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v === null ? <i className="muted">NULL</i> : String(v)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
