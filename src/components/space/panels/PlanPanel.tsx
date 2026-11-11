"use client";
/**
 * 学习路线（扩展 SQL：递归查询 + 拓扑排序 + 加权推荐）
 *
 * 数据全部来自数据库函数 fn_plan_path：递归 CTE 展开先修闭包，按“到目标的距离”倒序保证先修在前，
 * 同层再按阶段与真实错题数排序。前端只负责选择目标与呈现理由。
 */
import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { STAGE_NAME, type StageKey } from "@/lib/flora";
import { useSpace } from "../context";
import { useConcepts } from "../hooks";

type Step = { ord: number; conceptId: string; name: string; stage: StageKey; depth: number; mistakes: number; reason: string };
type Plan = { goal: { id: string; name: string }; steps: Step[]; todoCount: number; doneCount: number };

const STAGE_COLOR: Record<string, string> = { seed: "#B9B2C9", sprout: "#9CAF91", leaf: "#7E9A6E", bud: "#D7B779", bloom: "#D98C9A" };
const STAGE_CHIP: Record<string, string> = { seed: "", sprout: "sage", leaf: "sage", bud: "gold", bloom: "mist" };

export function PlanPanel() {
  const { space, open, toast } = useSpace();
  const { concepts } = useConcepts();
  const natal = space.plants.find((p) => p.isNatal);
  const due = space.plants.find((p) => p.reviewDue);
  const [goalId, setGoalId] = useState<string>(natal?.conceptId ?? space.plants[0]?.conceptId ?? "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!goalId) { setPlan(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    api<Plan>(`/api/goals/plan?goal=${goalId}&limit=12`)
      .then((p) => { if (alive) setPlan(p); })
      .catch((e) => { if (alive) { setErr(e.message); setPlan(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [goalId]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const c of concepts) {
      if (!m.has(c.subjectName)) m.set(c.subjectName, []);
      m.get(c.subjectName)!.push({ id: c.id, name: c.name });
    }
    return [...m.entries()];
  }, [concepts]);

  const plantOf = (conceptId: string) => space.plants.find((p) => p.conceptId === conceptId);
  const firstTodo = plan?.steps.find((s) => s.stage !== "bloom");

  if (!space.plants.length) return <div className="panel-body"><div className="empty">花圃里还没有植物。先完成开场，或从书房问星灯一个问题。</div></div>;

  return (
    <div className="panel-body">
      <div className="section">
        <div className="plan-head">
          <label className="row small" style={{ gap: 8 }}>
            <span className="muted">我想学</span>
            <select className="select" style={{ width: "auto", minWidth: 200 }} value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="目标知识点">
              {goalId && !concepts.some((c) => c.id === goalId) && <option value={goalId}>{plan?.goal.name ?? "目标"}</option>}
              {groups.map(([subject, list]) => (
                <optgroup key={subject} label={subject}>
                  {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {natal && <button className={`chip ${goalId === natal.conceptId ? "gold" : ""}`} style={{ cursor: "pointer" }} onClick={() => setGoalId(natal.conceptId)}>本命花 · {natal.conceptName}</button>}
          {due && <button className={`chip ${goalId === due.conceptId ? "gold" : ""}`} style={{ cursor: "pointer" }} onClick={() => setGoalId(due.conceptId)}>待复习 · {due.conceptName}</button>}
        </div>
      </div>

      {err && <div className="card"><span className="err small">{err}</span></div>}
      {loading && !plan && <p className="muted small">正在按先修关系铺路…</p>}

      {plan && (
        <>
          <div className="card section">
            <div className="plan-summary">
              <span className="small muted">共 <b className="plan-total">{plan.steps.length}</b> 步</span>
              <span><b>{plan.todoCount}</b><span className="small muted"> 待完成</span></span>
              <span><b>{plan.doneCount}</b><span className="small muted"> 已开花</span></span>
              <span className="small muted grow">目标：{plan.goal.name}</span>
            </div>
            {firstTodo && (
              <div className="row" style={{ marginTop: 10 }}>
                <span className="small">下一步：<b>{firstTodo.name}</b></span>
                <button className="btn btn-primary btn-sm" onClick={() => open({ panel: "practice", conceptId: firstTodo.conceptId })}>去练习</button>
                {plantOf(firstTodo.conceptId) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "dossier", plantId: plantOf(firstTodo.conceptId)!.id })}>看档案</button>
                )}
              </div>
            )}
          </div>

          <ol className="plan-list" aria-label={`学习路线：${plan.goal.name}`}>
            {plan.steps.map((s) => {
              const isNow = firstTodo?.conceptId === s.conceptId;
              const done = s.stage === "bloom";
              const plant = plantOf(s.conceptId);
              return (
                <li key={s.conceptId} className={`plan-step ${isNow ? "is-now" : ""} ${done ? "is-done" : ""}`}>
                  <span className="plan-no" aria-hidden="true">{s.ord}</span>
                  <div className="plan-main">
                    <div className="plan-name">
                      <span className="stage-dot" style={{ background: STAGE_COLOR[s.stage] }} />
                      {s.name}
                      <span className={`chip ${STAGE_CHIP[s.stage]}`}>{STAGE_NAME[s.stage]}</span>
                      {s.mistakes > 0 && <span className="chip rose">错 {s.mistakes} 次</span>}
                    </div>
                    <div className="plan-reason">{s.reason}{s.depth > 0 ? ` · 距离目标 ${s.depth} 层` : ""}</div>
                  </div>
                  <div className="plan-actions">
                    {!done && <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "practice", conceptId: s.conceptId })}>练习</button>}
                    {plant && <button className="btn btn-quiet btn-sm" onClick={() => open({ panel: "dossier", plantId: plant.id })}>档案</button>}
                  </div>
                </li>
              );
            })}
          </ol>

          <details className="sql-box">
            <summary>这条路线是怎么算出来的？（递归 CTE + 拓扑排序）</summary>
            <pre>{`WITH RECURSIVE closure(concept_id, depth) AS (
  SELECT $2::uuid, 0                       -- 目标
  UNION
  SELECT cp.prereq_concept_id, closure.depth + 1
    FROM concept_prerequisites cp JOIN closure ON cp.concept_id = closure.concept_id
   WHERE closure.depth < 12                -- 先修闭包
)
SELECT row_number() OVER (
         ORDER BY depth DESC,              -- 深度倒序 = 先修排在后继之前（拓扑序）
                  stage_rank ASC,          -- 同层：越弱越靠前
                  mistakes DESC,           -- 同层：错题越多越靠前
                  name) AS ord, …
  FROM closure JOIN concepts … LEFT JOIN learning_states …`}</pre>
            <p className="small muted" style={{ marginTop: 6 }}>先修关系有环时数据库会拒绝写入（递归 CTE 触发器），所以这里的递归一定能结束。</p>
          </details>
        </>
      )}

      {!plan && !loading && !err && <div className="empty">选择上面的目标知识点，星灯会按先修关系给出路线。</div>}
      {loading && <p className="muted small" style={{ marginTop: 8 }}>更新中…</p>}
      {plan && <p className="small muted" style={{ marginTop: 12 }}>路线只排“先修链上的知识点”；已开花的标成可跳过，避免重复劳动。</p>}
    </div>
  );
}
