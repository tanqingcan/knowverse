"use client";
/** 植物档案：一株花（知识点）的全部真实学习记录与成长依据 */
import React, { useEffect, useState } from "react";
import { api, fmtDate, fmtTime } from "@/lib/api";
import { FlowerSvg } from "@/components/art/Flower";
import { PALETTE, SPECIES, STAGE_NAME, STAGE_ORDER, type StageKey } from "@/lib/flora";
import { useSpace } from "../context";

const CAT_LABEL: Record<string, string> = { self: "自述理解", record: "学习记录", assisted: "辅助完成", independent: "独立作答", team: "团队/作品" };
const EVT: Record<string, string> = { planted: "种下", natal_chosen: "本命花", evidence_added: "新证据", stage_changed: "阶段变化", evidence_revoked: "证据修正", appearance_changed: "更换外观" };
const VERDICT: Record<string, string> = { correct: "正确", partial: "部分正确", incorrect: "未通过", ungraded: "未评分" };

export function DossierPanel() {
  const { panel, open, reload, onGrowth, toast, space } = useSpace();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editLook, setEditLook] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState({ title: "", content: "" });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    if (!panel.plantId) return;
    try { setD(await api(`/api/plants/${panel.plantId}`)); setErr(null); } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { setD(null); load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.plantId]);
  // 外部成长事件（练习、提问）发生后刷新档案
  const sp = space.plants.find((p) => p.id === panel.plantId);
  useEffect(() => { if (d && sp && sp.stage !== d.growth.stage) load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.stage, sp?.evidenceCount]);

  if (!panel.plantId) return <div className="panel-body"><div className="empty">在星球上点击一株植物，查看它的档案。</div></div>;
  if (err) return <div className="panel-body"><p className="err">{err}</p></div>;
  if (!d) return <div className="panel-body"><p className="muted">正在翻开档案…</p></div>;

  const { plant, growth } = d;
  const stage = growth.stage as StageKey;
  const si = STAGE_ORDER.indexOf(stage);
  const look = async (patch: any) => {
    try { await api(`/api/plants/${plant.id}`, { method: "PATCH", body: patch }); await Promise.all([load(), reload()]); } catch (e: any) { toast(e.message, "error"); }
  };
  const selfReport = async () => {
    const r = await api<{ growth: any[] }>("/api/self-report", { body: { conceptId: plant.conceptId, text: "我觉得我理解了" } });
    onGrowth(r.growth); toast("已记录为“自述理解”。它会显示在档案里，但不会单独推动成长阶段。"); load();
  };
  const saveNote = async () => {
    try {
      const r = await api<{ growth: any[] }>("/api/notes", { body: { conceptId: plant.conceptId, title: note.title || "笔记", content: note.content } });
      setNote({ title: "", content: "" }); setNoteOpen(false); onGrowth(r.growth); load();
    } catch (e: any) { toast(e.message, "error"); }
  };
  const revoke = async (id: string) => {
    try { const r = await api<any>(`/api/evidence/${id}/revoke`, { body: { reason } }); setRevoking(null); setReason(""); onGrowth(r.events); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <div className="panel-body">
      <div className="dossier-hero">
        <FlowerSvg uid={`dos-${plant.id.slice(0, 8)}`} species={plant.species} color={plant.color} stage={stage} size={150} seed={7} title={`${plant.conceptName}，${STAGE_NAME[stage]}`} />
        <div>
          <div className="small muted">{plant.subjectName} · {plant.gardenName}</div>
          <h2 style={{ fontSize: 22, margin: "2px 0" }}>{plant.conceptName}</h2>
          <div className="row">
            {plant.nickname && <span className="chip rose">「{plant.nickname}」</span>}
            {plant.isNatal && <span className="chip gold">本命花</span>}
            <span className="chip sage">{STAGE_NAME[stage]}</span>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>种下于 {fmtDate(plant.plantedAt)}</div>
        </div>
      </div>

      <div className="stage-track" aria-label="成长阶段">
        {STAGE_ORDER.map((s, i) => <span key={s} className={i < si ? "on" : i === si ? "cur" : ""}>{STAGE_NAME[s]}</span>)}
      </div>
      <div className="section card">
        <div><b>为什么是{STAGE_NAME[stage]}：</b>{growth.reason}</div>
        <div style={{ marginTop: 4 }}><b>下一步：</b>{growth.next}</div>
        {growth.reviewDueAt && <div className="small muted" style={{ marginTop: 4 }}>温和提醒：{new Date(growth.reviewDueAt) < new Date() ? "已经可以回来复习了" : `${fmtDate(growth.reviewDueAt)} 前后可以回来复习`}（不会让花枯萎）</div>}
        <div className="small muted" style={{ marginTop: 6 }}>{growth.disclaimer}</div>
      </div>

      <div className="row section">
        <button className="btn btn-primary btn-sm" onClick={() => open({ panel: "chat", conceptId: plant.conceptId, conversationId: null })}>问星灯</button>
        <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "practice", conceptId: plant.conceptId })}>做练习</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setNoteOpen(!noteOpen)}>写笔记</button>
        <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "history", conceptId: plant.conceptId })}>检索相关问答</button>
        <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "cards", conceptId: plant.conceptId, draft: "1" })}>整理学习卡</button>
        <button className="btn btn-quiet btn-sm" onClick={selfReport} title="记录为自述理解，不推动阶段">我觉得我理解了</button>
      </div>
      {noteOpen && (
        <div className="card section">
          <input className="input" placeholder="标题" value={note.title} maxLength={60} onChange={(e) => setNote({ ...note, title: e.target.value })} />
          <textarea className="textarea" style={{ marginTop: 6 }} rows={3} placeholder="用自己的话写下要点" value={note.content} onChange={(e) => setNote({ ...note, content: e.target.value })} />
          <div className="row" style={{ marginTop: 6 }}><button className="btn btn-primary btn-sm" disabled={!note.content.trim()} onClick={saveNote}>保存</button><button className="btn btn-quiet btn-sm" onClick={() => setNoteOpen(false)}>取消</button></div>
        </div>
      )}

      <div className="section">
        <h3>成长依据 <span className="small muted">{growth.evidence.length} 条</span></h3>
        {growth.evidence.length === 0 && <p className="muted small">还没有证据。</p>}
        {growth.evidence.map((e: any) => (
          <div key={e.id} className={`ev ${e.revokedAt ? "revoked" : ""}`}>
            <div><div className={`kind cat-${e.category}`}>{CAT_LABEL[e.category]}</div><div className="small muted">{fmtTime(e.createdAt)}</div></div>
            <div>
              <b>{e.label}</b>{e.usedHints ? <span className="chip gold" style={{ marginLeft: 6 }}>使用过提示</span> : null}{e.origin === "seed" ? <span className="chip" style={{ marginLeft: 6 }}>预置</span> : null}
              <div className="small">{e.detail}</div>
              {e.revokedAt && <div className="small" style={{ textDecoration: "none" }}>已修正：{e.revokeReason}</div>}
              {e.messageId && e.conversationId && <button className="btn btn-quiet btn-sm" style={{ padding: "0 4px" }} onClick={() => open({ panel: "chat", conversationId: e.conversationId, messageId: e.messageId })}>查看原问题</button>}
              {revoking === e.id && (
                <div className="row" style={{ marginTop: 4 }}>
                  <input className="input grow" style={{ padding: "3px 8px" }} placeholder="修正原因（会保留在历史中）" value={reason} onChange={(x) => setReason(x.target.value)} />
                  <button className="btn btn-primary btn-sm" disabled={reason.trim().length < 2} onClick={() => revoke(e.id)}>确认修正</button>
                </div>
              )}
            </div>
            <div>{!e.revokedAt && <button className="btn btn-quiet btn-sm" onClick={() => setRevoking(revoking === e.id ? null : e.id)}>修正</button>}</div>
          </div>
        ))}
      </div>

      <div className="section">
        <h3>关联问答 <span className="small muted">{d.qa.length} 组</span></h3>
        {d.qa.length === 0 && <p className="muted small">还没有与它关联的问答。提问时选择这个知识点，或在消息上确认标签。</p>}
        {d.qa.map((x: any) => (
          <button key={x.questionId} className="card clickable" onClick={() => open({ panel: "chat", conversationId: x.conversationId, messageId: x.questionId })}>
            <div className="row"><span className="grow">{x.question.length > 70 ? x.question.slice(0, 70) + "…" : x.question}</span>{x.origin === "seed" && <span className="chip gold">预置</span>}</div>
            <div className="small muted">{x.localTime} · 《{x.title}》{x.status === "candidate" ? " · 候选标签" : ""}</div>
          </button>
        ))}
      </div>

      {d.notes.length > 0 && (
        <div className="section"><h3>笔记</h3>
          {d.notes.map((n: any) => <div key={n.id} className="card"><b>{n.title}</b><div className="small" style={{ whiteSpace: "pre-wrap" }}>{n.content}</div><div className="small muted">{fmtTime(n.createdAt)}</div></div>)}
        </div>
      )}

      {d.attempts.length > 0 && (
        <div className="section"><h3>练习记录</h3>
          {d.attempts.map((a: any) => (
            <div key={a.id} className="ev">
              <div className="small muted">{fmtTime(a.submittedAt)}</div>
              <div>{a.title} <span className="small muted">v{a.versionNo}{a.isVariant ? " · 变式" : ""} · {a.mode === "guided" ? "引导" : a.mode === "diagnostic" ? "诊断" : "独立"}{a.hints ? ` · 提示 ${a.hints} 次` : ""}</span></div>
              <div className={`verdict ${a.verdict}`} style={{ fontSize: 13 }}>{VERDICT[a.verdict] ?? a.verdict}</div>
            </div>
          ))}
        </div>
      )}

      {(d.materials.length > 0 || d.prereqs.length > 0) && (
        <div className="section"><h3>资料与先修</h3>
          <div className="row">
            {d.materials.map((m: any) => <button key={m.versionId} className="chip mist" style={{ cursor: "pointer" }} onClick={() => open({ panel: "materials", materialId: m.id, versionNo: m.versionNo })}>《{m.title}》v{m.versionNo}</button>)}
          </div>
          {d.prereqs.length > 0 && <div className="row" style={{ marginTop: 6 }}><span className="small muted">先修：</span>{d.prereqs.map((p: any) => <span key={p.id} className="chip">{p.name} · {STAGE_NAME[p.stage as StageKey]}</span>)}</div>}
        </div>
      )}

      <div className="section">
        <h3>外观 <span className="small muted">只代表喜好，不影响学习记录</span></h3>
        {!editLook ? <button className="btn btn-ghost btn-sm" onClick={() => setEditLook(true)}>更换花种或花色</button> : (
          <div className="stack">
            <div className="species-grid">
              {SPECIES.map((s) => (
                <button key={s.key} className="species-card" aria-pressed={plant.species === s.key} onClick={() => look({ species: s.key })}>
                  <FlowerSvg uid={`dl-${s.key}`} species={s.key} color={plant.color} stage="bloom" size={56} seed={3} /><div className="n">{s.name}</div>
                </button>
              ))}
            </div>
            <div className="swatches">{PALETTE.map((p) => <button key={p.key} className="swatch" style={{ background: p.petal }} aria-pressed={plant.color === p.key} aria-label={p.name} onClick={() => look({ color: p.key })} />)}</div>
            <div className="row">
              {!plant.isNatal && <button className="btn btn-ghost btn-sm" onClick={() => look({ natal: true })}>设为本命花</button>}
              <button className="btn btn-quiet btn-sm" onClick={() => setEditLook(false)}>完成</button>
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <h3>这株花的时间轴</h3>
        {d.timeline.map((t: any) => (
          <div key={t.id} className="tl-item"><span className="time">{fmtDate(t.createdAt).slice(5)}</span><span><b>{EVT[t.eventType]}</b>{t.toStage && t.eventType === "stage_changed" ? ` ${STAGE_NAME[t.fromStage as StageKey]} → ${STAGE_NAME[t.toStage as StageKey]}` : ""} <span className="small muted">{t.reason}</span>{t.origin === "seed" ? <span className="chip" style={{ marginLeft: 4 }}>预置</span> : null}</span></div>
        ))}
      </div>
    </div>
  );
}
