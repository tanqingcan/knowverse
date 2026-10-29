"use client";
/**
 * 班级星系（增强功能）：多颗个人星球；只显示对方公开的内容。
 * 公开学习意愿 → 可解释的互补伙伴匹配；共学小组名额由数据库约束保证不超员。
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FlowerBody, FlowerDefs } from "@/components/art/Flower";
import { STAGE_NAME, type StageKey } from "@/lib/flora";
import { useSpace } from "../context";
import { useConcepts } from "../hooks";

export function GalaxyPanel() {
  const { toast } = useSpace();
  const [classes, setClasses] = useState<any[] | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const load = () => api<any[]>("/api/classes").then((c) => { setClasses(c); if (!cur && c[0]) setCur(c[0].id); });
  useEffect(() => { load().catch(() => setClasses([])); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="panel-body">
      <div className="row section">
        {classes?.map((c) => <button key={c.id} className={`chip ${c.id === cur ? "mist" : ""}`} style={{ cursor: "pointer" }} onClick={() => setCur(c.id)}>{c.name} · {c.members} 人</button>)}
      </div>
      <div className="row section">
        <input className="input" style={{ width: 120 }} placeholder="邀请码" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn btn-ghost btn-sm" disabled={!code.trim()} onClick={async () => { try { const r = await api<any>("/api/classes/join", { body: { code } }); setCode(""); await load(); setCur(r.classId); } catch (e: any) { toast(e.message, "error"); } }}>加入星系</button>
        <input className="input grow" placeholder="新星系名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-ghost btn-sm" disabled={!name.trim()} onClick={async () => { const r = await api<any>("/api/classes", { body: { name } }); setName(""); await load(); setCur(r.classId); }}>创建</button>
      </div>
      {classes?.length === 0 && <div className="empty">还没有加入任何班级星系。输入邀请码加入（演示：KV2026）。</div>}
      {cur && <ClassView id={cur} me={classes?.find((c) => c.id === cur)} onChanged={load} />}
    </div>
  );
}

function ClassView({ id, me, onChanged }: { id: string; me: any; onChanged: () => void }) {
  const { toast, space, onGrowth } = useSpace();
  const { concepts } = useConcepts();
  const [g, setG] = useState<any>(null);
  const [partners, setPartners] = useState<any[] | null>(null);
  const [intents, setIntents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [intent, setIntent] = useState({ conceptId: "", direction: "seek" });
  const [contrib, setContrib] = useState<Record<string, string>>({});
  const load = async () => {
    const [a, b, c, d, e] = await Promise.all([api(`/api/classes/${id}`), api<any[]>(`/api/classes/${id}/partners`), api<any[]>(`/api/classes/${id}/intents`), api<any[]>(`/api/classes/${id}/groups`), api<any[]>(`/api/classes/${id}/cards`)]);
    setG(a); setPartners(b); setIntents(c); setGroups(d); setCards(e);
  };
  useEffect(() => { load().catch((e) => toast(e.message, "error")); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const share = async (patch: any) => { await api(`/api/classes/${id}/sharing`, { body: patch }); onChanged(); load(); };
  if (!g) return <p className="muted">加载中…</p>;
  const n = g.planets.length;
  return (
    <>
      <svg className="galaxy-map" viewBox="-200 -120 400 240" role="img" aria-label={`${g.class.name}：${n} 颗公开的星球`}>
        <ellipse cx={0} cy={0} rx={160} ry={70} fill="none" stroke="#B8ACD9" strokeOpacity={0.18} strokeDasharray="2 5" />
        {g.planets.map((p: any, i: number) => {
          const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(a) * 140, y = Math.sin(a) * 62;
          const uid = `gx-${p.userId.slice(0, 6)}`;
          return (
            <g key={p.userId} transform={`translate(${x} ${y})`}>
              <circle r={p.isMe ? 22 : 18} fill="#8fa587" />
              <circle r={p.isMe ? 22 : 18} fill="url(#gx-shade)" />
              {p.natalSpecies && <g transform="translate(0 -14) scale(0.32)"><FlowerDefs uid={uid} color={p.natalColor} /><FlowerBody uid={uid} species={p.natalSpecies} stage="bloom" withGround={false} /></g>}
              <text y={38} textAnchor="middle" fontSize={10} fill="#F5EEDF">{p.displayName}{p.isMe ? "（我）" : ""}</text>
              <text y={50} textAnchor="middle" fontSize={8.5} fill="#B8ACD9">{p.planetName}</text>
            </g>
          );
        })}
        <defs><radialGradient id="gx-shade" cx="35%" cy="30%"><stop offset="0%" stopColor="#fff" stopOpacity={0.35} /><stop offset="100%" stopColor="#101629" stopOpacity={0.5} /></radialGradient></defs>
        <text x={0} y={4} textAnchor="middle" fontSize={11} fill="#F5EEDF" opacity={0.75}>{g.class.name}</text>
      </svg>
      <p className="small muted" style={{ marginTop: 6 }}>邀请码 {g.class.joinCode}。{g.hiddenCount > 0 ? `另有 ${g.hiddenCount} 位成员未公开星球。` : ""}默认什么都不公开，只显示每个人主动打开的内容。</p>
      <p style={{ marginTop: 6 }}><a className="btn btn-soft btn-sm" href="/visit">参观示例星球（只读）→</a></p>

      <div className="section card">
        <h3>我在这个星系的分享</h3>
        <label className="row small"><input type="checkbox" checked={!!me?.sharePlanet} onChange={(e) => share({ sharePlanet: e.target.checked })} />公开我的星球与本命花</label>
        <label className="row small"><input type="checkbox" checked={!!me?.shareStages} onChange={(e) => share({ shareStages: e.target.checked })} />公开植物的成长阶段（不含对话内容）</label>
        <label className="row small"><input type="checkbox" checked={!!me?.openToPartner} onChange={(e) => share({ openToPartner: e.target.checked })} />参与学习伙伴匹配（只使用下方公开的意愿）</label>
      </div>

      <div className="section">
        <h3>公开学习意愿</h3>
        <div className="row">
          {intents.map((x) => <span key={x.id} className={`chip ${x.direction === "seek" ? "rose" : "sage"}`}>{x.direction === "seek" ? "想获得帮助" : "可以帮助"} · {x.conceptName}<button aria-label="撤回" onClick={async () => { await api(`/api/intents/${x.id}`, { method: "DELETE" }); load(); }}>✕</button></span>)}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <select className="select" style={{ width: "auto" }} value={intent.direction} onChange={(e) => setIntent({ ...intent, direction: e.target.value })} aria-label="方向"><option value="seek">想获得帮助</option><option value="offer">可以帮助</option></select>
          <select className="select grow" value={intent.conceptId} onChange={(e) => setIntent({ ...intent, conceptId: e.target.value })} aria-label="知识点">
            <option value="">选择知识点</option>{concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={!intent.conceptId} onClick={async () => { await api(`/api/classes/${id}/intents`, { body: intent }); load(); }}>添加</button>
        </div>
      </div>

      <div className="section">
        <h3>互补学习伙伴</h3>
        {!me?.openToPartner && <p className="small muted">开启“参与学习伙伴匹配”后才会计算。</p>}
        {partners?.length === 0 && me?.openToPartner && <p className="small muted">暂时没有互补的伙伴。</p>}
        {partners?.map((p) => (
          <div key={p.userId} className="card"><div className="row"><b className="grow">{p.displayName}</b>{p.mutual && <span className="chip gold">双向互补</span>}<span className="chip">{p.score} 个知识点</span></div><div className="small">{p.why}</div></div>
        ))}
      </div>

      <div className="section">
        <h3>共学小组</h3>
        {groups.map((gr) => (
          <div key={gr.id} className="card">
            <div className="row"><b className="grow">{gr.title}</b><span className="chip">{gr.conceptName}</span><span className={`chip ${gr.memberCount >= gr.capacity ? "rose" : "sage"}`}>{gr.memberCount}/{gr.capacity}</span></div>
            <div className="small muted">发起：{gr.creator}</div>
            {!gr.joined && <button className="btn btn-ghost btn-sm" disabled={gr.memberCount >= gr.capacity} onClick={async () => { try { await api(`/api/groups/${gr.id}/join`, { method: "POST" }); load(); } catch (e: any) { toast(e.message, "error"); load(); } }}>{gr.memberCount >= gr.capacity ? "名额已满" : "申请加入"}</button>}
            {gr.contributions.map((c: any, i: number) => <div key={i} className="small" style={{ marginTop: 4 }}><b>{c.displayName}</b>（{({ explanation: "讲解", question: "提问", review: "复核" } as any)[c.kind]}）：{c.content}</div>)}
            {gr.joined && (
              <div className="row" style={{ marginTop: 6 }}>
                <input className="input grow" placeholder="写下你的讲解（记为团队贡献证据）" value={contrib[gr.id] ?? ""} onChange={(e) => setContrib({ ...contrib, [gr.id]: e.target.value })} />
                <button className="btn btn-ghost btn-sm" disabled={!contrib[gr.id]?.trim()} onClick={async () => { const r = await api<any>(`/api/groups/${gr.id}/contributions`, { body: { kind: "explanation", content: contrib[gr.id] } }); setContrib({ ...contrib, [gr.id]: "" }); onGrowth(r.growth); load(); }}>提交</button>
              </div>
            )}
          </div>
        ))}
        <NewGroup classId={id} onDone={load} plants={space.plants} />
      </div>

      {cards.length > 0 && (
        <div className="section"><h3>班级公开学习卡</h3>
          {cards.map((c) => <div key={c.versionId} className="card"><b>{c.title}</b> <span className="small muted">v{c.versionNo} · {c.author} · {c.conceptName}</span></div>)}
        </div>
      )}
      <p className="small muted">成员的阶段只在对方公开时显示，例如：{g.planets.filter((p: any) => p.plants && !p.isMe).slice(0, 1).map((p: any) => `${p.displayName}：${p.plants.map((x: any) => `${x.conceptName}·${STAGE_NAME[x.stage as StageKey]}`).join("、")}`)}</p>
    </>
  );
}

function NewGroup({ classId, onDone, plants }: { classId: string; onDone: () => void; plants: any[] }) {
  const { toast } = useSpace();
  const [f, setF] = useState({ conceptId: "", title: "", capacity: 2 });
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <select className="select" style={{ width: "auto" }} value={f.conceptId} onChange={(e) => setF({ ...f, conceptId: e.target.value })} aria-label="知识点"><option value="">知识点</option>{plants.map((p) => <option key={p.id} value={p.conceptId}>{p.conceptName}</option>)}</select>
      <input className="input grow" placeholder="小组名称" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <select className="select" style={{ width: "auto" }} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} aria-label="名额">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} 人</option>)}</select>
      <button className="btn btn-ghost btn-sm" disabled={!f.conceptId || !f.title.trim()} onClick={async () => { try { await api(`/api/classes/${classId}/groups`, { body: f }); setF({ conceptId: "", title: "", capacity: 2 }); onDone(); } catch (e: any) { toast(e.message, "error"); } }}>发起</button>
    </div>
  );
}
