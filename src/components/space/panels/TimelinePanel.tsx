"use client";
/** 成长时间轴：只展示数据库中的真实成长事件；回放按时间重放真实的阶段变化 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { STAGE_NAME, type StageKey } from "@/lib/flora";
import { useSpace } from "../context";

export type Ev = { id: string; eventType: string; fromStage: StageKey | null; toStage: StageKey | null; reason: string; origin: string; createdAt: string; localDate: string; localTime: string; conceptId: string; conceptName: string; plantId: string | null };
export const EVT: Record<string, string> = { planted: "种下", natal_chosen: "本命花", evidence_added: "新证据", stage_changed: "成长", evidence_revoked: "证据修正", appearance_changed: "更换外观" };

let cache: Ev[] | null = null;
let listeners: ((e: Ev[]) => void)[] = [];
async function fetchTimeline() { cache = await api<Ev[]>("/api/timeline"); listeners.forEach((l) => l(cache!)); return cache; }

export function useTimeline() {
  const { space } = useSpace();
  const [ev, setEv] = useState<Ev[] | null>(cache);
  useEffect(() => { listeners.push(setEv); return () => { listeners = listeners.filter((l) => l !== setEv); }; }, []);
  // 星球数据变化（新的成长事件）时刷新
  const sig = space.plants.map((p) => p.stage + p.evidenceCount).join();
  useEffect(() => { fetchTimeline().catch(() => {}); }, [sig]);
  return ev;
}

export function TimelineBar() {
  const { open, replay, replaying } = useSpace();
  const ev = useTimeline();
  const recent = (ev ?? []).filter((e) => e.eventType !== "evidence_added").slice(0, 8);
  const changes = (ev ?? []).filter((e) => e.eventType === "stage_changed");
  return (
    <footer className="timeline-bar" aria-label="成长时间轴">
      <button className="btn btn-ghost btn-sm" onClick={() => open({ panel: "timeline" })}>成长时间轴</button>
      <div className="events">
        {recent.map((e) => (
          <button key={e.id} className="tl-chip" onClick={() => e.plantId && open({ panel: "dossier", plantId: e.plantId })}>
            <span style={{ color: "var(--mist)" }}>{e.localDate.slice(5)}</span>{e.conceptName} · {e.eventType === "stage_changed" && e.toStage ? `${STAGE_NAME[e.fromStage ?? "seed"]}→${STAGE_NAME[e.toStage]}` : EVT[e.eventType]}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm desktop-only" disabled={!changes.length || replaying} onClick={() => replay(changes)}>{replaying ? "回放中…" : "回放成长"}</button>
    </footer>
  );
}

export function TimelinePanel() {
  const { open, replay, replaying } = useSpace();
  const ev = useTimeline();
  const [onlyStage, setOnlyStage] = useState(false);
  if (!ev) return <div className="panel-body"><p className="muted">加载中…</p></div>;
  const shown = onlyStage ? ev.filter((e) => e.eventType === "stage_changed") : ev;
  const days = [...new Set(shown.map((e) => e.localDate))];
  return (
    <div className="panel-body">
      <div className="row section">
        <label className="row small"><input type="checkbox" checked={onlyStage} onChange={(e) => setOnlyStage(e.target.checked)} />只看阶段变化</label>
        <span className="grow" />
        <button className="btn btn-primary btn-sm" disabled={replaying} onClick={() => replay(ev.filter((e) => e.eventType === "stage_changed"))}>在星球上回放</button>
      </div>
      <p className="small muted">每一条都是数据库中的真实事件；回放只是按时间重新播放这些事件。</p>
      {days.map((d) => (
        <div key={d}>
          <div className="tl-day">{d}</div>
          {shown.filter((e) => e.localDate === d).map((e) => (
            <div key={e.id} className="tl-item">
              <span className="time">{e.localTime}</span>
              <span>
                <button className="btn btn-quiet btn-sm" style={{ padding: 0, fontWeight: 600 }} onClick={() => e.plantId && open({ panel: "dossier", plantId: e.plantId })}>{e.conceptName}</button>
                {" "}<span className="chip">{EVT[e.eventType]}</span>{e.eventType === "stage_changed" && e.toStage ? ` ${STAGE_NAME[e.fromStage ?? "seed"]} → ${STAGE_NAME[e.toStage]}` : ""}
                {e.origin === "seed" && <span className="chip" style={{ marginLeft: 4 }}>预置</span>}
                <div className="small muted">{e.reason}</div>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
