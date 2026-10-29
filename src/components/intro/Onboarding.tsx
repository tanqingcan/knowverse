"use client";
/**
 * 新用户开场：输入学习目标 → 确认系统提取的知识点 → 选择本命花（花种、花色、名字）→ 为星球命名 → 保存
 * 每一步的数据最终在一个数据库事务中写入（/api/onboarding）。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { WorldPlant as ScenePlant } from "@/components/world/layout";

const StaticGarden = dynamic(() => import("@/components/world/StaticGarden").then((m) => m.StaticGarden), { ssr: false });
import { FlowerSvg } from "@/components/art/Flower";
import { GuideOrb } from "@/components/art/Props";
import { api, ApiError } from "@/lib/api";
import { PALETTE, SPECIES } from "@/lib/flora";
import { Sky } from "@/components/ui/Sky";

type Subject = { id: string; name: string; code: string; isPublic: boolean };
type Proposal = { conceptId: string; name: string; why: string; order: number };


export function Onboarding({ user, subjects: initialSubjects }: { user: { displayName: string; isDemo: boolean; reducedMotion: boolean }; subjects: Subject[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [goal, setGoal] = useState("");
  const [subjectId, setSubjectId] = useState(initialSubjects[0]?.id ?? "");
  const [newSubject, setNewSubject] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [natalRef, setNatalRef] = useState("");
  const [species, setSpecies] = useState("rose");
  const [color, setColor] = useState("rose");
  const [nickname, setNickname] = useState("");
  const [planetName, setPlanetName] = useState(`${user.displayName}的星球`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chosen = useMemo(() => [
    ...proposals.filter((p) => checked[p.conceptId]).map((p) => ({ ref: p.conceptId, name: p.name })),
    ...custom.map((n) => ({ ref: `new:${n}`, name: n })),
  ], [proposals, checked, custom]);

  const scenePlants: ScenePlant[] = chosen.map((c, i) => ({
    id: `onb-${i}-${c.ref}`, conceptName: c.name, species: c.ref === natalRef ? species : "rose", color: c.ref === natalRef ? color : "cream",
    stage: step >= 2 && c.ref === natalRef ? "bloom" : "seed", isNatal: c.ref === natalRef,
  }));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof ApiError ? e.message : "出了点问题，请重试"); } finally { setBusy(false); }
  };

  const toConcepts = () => run(async () => {
    let sid = subjectId;
    if (sid === "__new") {
      const s = await api<Subject>("/api/subjects", { body: { name: newSubject } });
      setSubjects((x) => (x.some((y) => y.id === s.id) ? x : [...x, { ...s, code: "", isPublic: false }]));
      setSubjectId(s.id); sid = s.id;
    }
    const r = await api<{ concepts: Proposal[] }>("/api/onboarding/propose", { body: { goalText: goal, subjectId: sid } });
    setProposals(r.concepts);
    setChecked(Object.fromEntries(r.concepts.map((c) => [c.conceptId, true])));
    setStep(1);
  });

  const finish = () => run(async () => {
    await api("/api/onboarding", {
      body: {
        planetName, goalTitle: goal, subjectId,
        conceptIds: proposals.filter((p) => checked[p.conceptId]).map((p) => p.conceptId),
        newConceptNames: custom,
        natal: { conceptRef: natalRef, species, color, nickname },
      },
    });
    router.replace("/space?welcome=1");
    router.refresh();
  });

  const [osReduced, setOsReduced] = useState(false);
  useEffect(() => { setOsReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const reduced = user.reducedMotion || osReduced;
  return (
    <main className={`onb ${reduced ? "reduced-motion" : ""}`}>
      <Sky />
      <section className="onb-stage" aria-label="星球预览">
        <StaticGarden plants={scenePlants.map((p) => ({ ...p, gardenIndex: 0 }))} gardens={[{ name: "" }]} pose="idle" reduced={reduced}
          signText={scenePlants.find((p) => p.isNatal) ? (nickname || scenePlants.find((p) => p.isNatal)!.conceptName) : ""} />
        <div className="stage-caption"><div className="title">{planetName || "无名星球"}</div><div className="sub">{chosen.length ? `${chosen.length} 颗种子` : "一小块空花圃"}</div></div>
      </section>
      <section className="onb-card paper" aria-live="polite">
        <div className="steps" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>
        <div className="row" style={{ marginBottom: 10, alignItems: "flex-start" }}>
          <GuideOrb size={36} />
          <p className="grow" style={{ margin: 0, fontSize: 14 }}>
            {step === 0 && "你好，我是星灯。先告诉我：如果你有一颗自己的星球，你想在上面种下什么？写下一个具体的学习目标就好。"}
            {step === 1 && "我在课程目录里找到了这些相关的知识点（包括它们的先修）。你可以取消不需要的，也可以加上自己的。"}
            {step === 2 && "选一株作为你的本命花。花种和花色只是你的喜好，和能力无关，以后也可以更换。"}
            {step === 3 && "最后，给你的星球起个名字吧。"}
          </p>
        </div>
        {user.isDemo && <p className="note">这是演示用的新旅人账号，数据会真实写入数据库。</p>}

        {step === 0 && (
          <div className="stack">
            <label className="field"><span>我的学习目标</span>
              <textarea className="textarea" rows={3} maxLength={120} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="例如：弄懂 LEFT JOIN 与 WHERE 对查询结果的影响" />
            </label>
            <label className="field"><span>学科</span>
              <select className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isPublic ? "" : "（个人）"}</option>)}
                <option value="__new">其他学科…</option>
              </select>
            </label>
            {subjectId === "__new" && <label className="field"><span>学科名称</span><input className="input" value={newSubject} maxLength={30} onChange={(e) => setNewSubject(e.target.value)} placeholder="例如：线性代数、古代汉语" /></label>}
            <div className="row"><button className="btn btn-primary" disabled={busy || !goal.trim() || (subjectId === "__new" && !newSubject.trim())} onClick={toConcepts}>{busy ? "正在寻找知识点…" : "下一步"}</button></div>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            {proposals.length === 0 && <p className="muted small">这个学科的课程目录里还没有知识点。请在下面添加你自己的知识点。</p>}
            <div>
              {proposals.map((p) => (
                <label key={p.conceptId} className="concept-check">
                  <input type="checkbox" checked={!!checked[p.conceptId]} onChange={(e) => setChecked({ ...checked, [p.conceptId]: e.target.checked })} />
                  <span><b>{p.name}</b><br /><span className="why">{p.why}</span></span>
                </label>
              ))}
              {custom.map((n) => (
                <div key={n} className="concept-check"><span className="grow"><b>{n}</b><br /><span className="why">你添加的新知识点（个人）</span></span>
                  <button className="btn btn-quiet btn-sm" onClick={() => setCustom(custom.filter((x) => x !== n))}>移除</button></div>
              ))}
            </div>
            <div className="row">
              <input className="input grow" value={customInput} maxLength={40} onChange={(e) => setCustomInput(e.target.value)} placeholder="添加一个知识点" onKeyDown={(e) => { if (e.key === "Enter" && customInput.trim()) { setCustom([...new Set([...custom, customInput.trim()])]); setCustomInput(""); } }} />
              <button className="btn btn-ghost" disabled={!customInput.trim()} onClick={() => { setCustom([...new Set([...custom, customInput.trim()])]); setCustomInput(""); }}>添加</button>
            </div>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>上一步</button>
              <button className="btn btn-primary" disabled={!chosen.length} onClick={() => { setNatalRef(chosen[0].ref); setStep(2); }}>确认 {chosen.length} 个知识点</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <label className="field"><span>哪一株是你的本命花？</span>
              <select className="select" value={natalRef} onChange={(e) => setNatalRef(e.target.value)}>
                {chosen.map((c) => <option key={c.ref} value={c.ref}>{c.name}</option>)}
              </select>
            </label>
            <div className="field"><span>花种</span>
              <div className="species-grid" role="group" aria-label="花种">
                {SPECIES.map((s) => (
                  <button key={s.key} type="button" className="species-card" aria-pressed={species === s.key} onClick={() => setSpecies(s.key)}>
                    <FlowerSvg uid={`onb-sp-${s.key}`} species={s.key} color={color} stage="bloom" size={74} seed={5} />
                    <div className="n">{s.name}</div><div className="l">{s.line}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="field"><span>花色</span>
              <div className="swatches" role="group" aria-label="花色">
                {PALETTE.map((p) => <button key={p.key} type="button" className="swatch" style={{ background: p.petal }} aria-pressed={color === p.key} aria-label={p.name} title={p.name} onClick={() => setColor(p.key)} />)}
              </div>
            </div>
            <label className="field"><span>给它起个名字</span><input className="input" value={nickname} maxLength={16} onChange={(e) => setNickname(e.target.value)} placeholder="例如：晚星" /></label>
            <p className="muted small" style={{ margin: 0 }}>新种下的植物都从“种子”开始。预览中展示的是它将来开花的样子。</p>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>上一步</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>下一步</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <label className="field"><span>星球的名字</span><input className="input" value={planetName} maxLength={24} onChange={(e) => setPlanetName(e.target.value)} /></label>
            <div className="card small">
              <div><b>目标</b>：{goal}</div>
              <div><b>种下</b>：{chosen.map((c) => c.name).join("、")}</div>
              <div><b>本命花</b>：{chosen.find((c) => c.ref === natalRef)?.name} · {SPECIES.find((s) => s.key === species)?.name} · {PALETTE.find((p) => p.key === color)?.name}{nickname ? ` ·「${nickname}」` : ""}</div>
            </div>
            {err && <p className="err">{err}</p>}
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setStep(2)}>上一步</button>
              <button className="btn btn-primary" disabled={busy} onClick={finish}>{busy ? "正在种下…" : "种下，并进入星球"}</button>
            </div>
          </div>
        )}
        {err && step < 3 && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
      </section>
    </main>
  );
}
