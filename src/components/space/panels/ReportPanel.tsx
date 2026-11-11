"use client";
/**
 * 学习周报（扩展 SQL：窗口函数 / FILTER / GROUPING SETS / gaps-and-islands）
 *
 * 六块数据全部由服务端一条条 SQL 算出：每日活动、连续学习天数、阶段漏斗、
 * 学科小计与合计、班级百分位、错题排行。前端只做排版。
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSpace } from "../context";

type Daily = { date: string; questions: number; attempts: number; evidences: number; notes: number };
type Report = {
  range: { days: number; from: string | null; to: string | null };
  daily: Daily[];
  streak: { current_streak: number; longest_streak: number; last_active: string | null } | null;
  funnel: { plants: number; seed: number; sprout: number; leaf: number; bud: number; bloom: number } | null;
  bySubject: { subject: string; asked: number; practice: number; total: number }[];
  classRank: { percentile: number; evidenceCount: number; rnk: number; total: number; className: string } | null;
  topMistakes: { concept: string; mistakes: number; rnk: number }[];
  summary: { activeDays: number; questions: number; attempts: number; bloomed: number };
};

const STAGES: [keyof NonNullable<Report["funnel"]>, string, string][] = [
  ["seed", "种子", "#B9B2C9"],
  ["sprout", "嫩芽", "#9CAF91"],
  ["leaf", "生叶", "#7E9A6E"],
  ["bud", "花苞", "#D7B779"],
  ["bloom", "开花", "#D98C9A"],
];

export function ReportPanel() {
  const { toast } = useSpace();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Report>(`/api/reports/weekly?days=${days}`)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) toast(e.message, "error"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days, toast]);

  if (!data) return <div className="panel-body"><p className="muted small">{loading ? "正在汇总…" : "暂无数据"}</p></div>;
  const { summary, streak, funnel, daily, bySubject, classRank, topMistakes } = data;
  const maxDay = Math.max(1, ...daily.map((d) => d.questions + d.attempts + d.evidences + d.notes));
  const labelStep = days > 10 ? Math.ceil(daily.length / 8) : 1;

  return (
    <div className="panel-body">
      <div className="row section" style={{ justifyContent: "space-between" }}>
        <div className="row">
          {[7, 30].map((d) => (
            <button key={d} className={`chip ${days === d ? "gold" : ""}`} style={{ cursor: "pointer" }} onClick={() => setDays(d)} aria-pressed={days === d}>最近 {d} 天</button>
          ))}
        </div>
        <span className="small muted">{data.range.from} ~ {data.range.to}</span>
      </div>

      <div className="stat-grid section">
        <div className="stat"><div className="n">{summary.activeDays}<span className="small muted"> / {days}</span></div><div className="k">活跃天数</div></div>
        <div className="stat"><div className="n">{summary.questions}</div><div className="k">提问</div></div>
        <div className="stat"><div className="n">{summary.attempts}</div><div className="k">作答</div></div>
        <div className="stat"><div className="n">{summary.bloomed}</div><div className="k">已开花</div></div>
      </div>

      <div className="section card">
        <h3>连续学习（gaps-and-islands）</h3>
        <div className="row" style={{ gap: 22 }}>
          <span><b style={{ fontSize: 20 }}>{streak?.current_streak ?? 0}</b> <span className="small muted">天 · 当前连续</span></span>
          <span><b style={{ fontSize: 20 }}>{streak?.longest_streak ?? 0}</b> <span className="small muted">天 · 最长</span></span>
          <span className="small muted">最近活跃 {streak?.last_active ?? "—"}</span>
        </div>
      </div>

      <div className="section">
        <h3>阶段漏斗（FILTER）</h3>
        {STAGES.map(([key, label, color]) => {
          const n = (funnel?.[key] as number) ?? 0;
          const pct = funnel?.plants ? (n / funnel.plants) * 100 : 0;
          return (
            <div className="funnel-row" key={key}>
              <span className="small muted">{label}</span>
              <span className="funnel-track"><span className="funnel-fill" style={{ width: `${pct}%`, background: color }} /></span>
              <span className="small">{n}</span>
            </div>
          );
        })}
        <p className="small muted" style={{ marginTop: 6 }}>共 {funnel?.plants ?? 0} 株：阶段是产品里的成长记录，不是掌握程度。</p>
      </div>

      <div className="section">
        <h3>学科汇总（GROUPING SETS）</h3>
        <div className="subject-row small muted"><span>学科</span><span>提问</span><span>练习</span><span>合计</span></div>
        {bySubject.map((s) => (
          <div key={s.subject} className={`subject-row ${s.subject === "合计" ? "is-total" : ""}`}>
            <span>{s.subject}</span><span>{s.asked}</span><span>{s.practice}</span><span>{s.total}</span>
          </div>
        ))}
      </div>

      {classRank && (
        <div className="section card">
          <h3>班级位置（percent_rank）</h3>
          <div className="rank-badge">
            <b>第 {classRank.rnk} / {classRank.total} 名</b>
            <span className="small muted">超过 {Math.round(classRank.percentile * 100)}% 的同学 · 证据 {classRank.evidenceCount} 条</span>
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>{classRank.className}</p>
        </div>
      )}

      {topMistakes.length > 0 && (
        <div className="section">
          <h3>错题排行（rank 窗口）</h3>
          <div className="row">
            {topMistakes.map((m) => <span key={m.concept} className="chip rose">#{m.rnk} {m.concept} · {m.mistakes} 次</span>)}
          </div>
        </div>
      )}

      <div className="section">
        <h3>每日活动（generate_series 补零）</h3>
        <div className="daybars" role="img" aria-label={`最近 ${days} 天每日活动`}>
          {daily.map((d, i) => {
            const total = d.questions + d.attempts + d.evidences + d.notes;
            const h = Math.max(2, Math.round((total / maxDay) * 80));
            const show = i % labelStep === 0 || i === daily.length - 1;
            return (
              <div key={d.date} className={`daybar ${total ? "" : "is-empty"}`} title={`${d.date}：提问 ${d.questions} · 作答 ${d.attempts} · 证据 ${d.evidences} · 笔记 ${d.notes}`}>
                <span className="bar" style={{ height: h }} />
                <span className="lbl">{show ? d.date.slice(5) : ""}</span>
              </div>
            );
          })}
        </div>
      </div>

      <details className="sql-box">
        <summary>这六块数字背后的 SQL（课堂上的扩展 SQL）</summary>
        <pre>{`-- ① 连续学习天数：gaps-and-islands
SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM acts;
-- 每一段连续日期共享同一个 grp，再按 grp 分组求长度

-- ② 阶段漏斗
count(*) FILTER (WHERE stage = 'bloom') AS bloomed

-- ③ 学科小计 + 合计：一条语句
GROUP BY GROUPING SETS ((s.name), ())

-- ④ 班级百分位
percent_rank() OVER (ORDER BY evidence_count)

-- ⑤ 错题排行
rank() OVER (ORDER BY count(*) DESC)

-- ⑥ 每日补零
generate_series(current_date - 6, current_date, interval '1 day')`}</pre>
      </details>

      <p className="small muted" style={{ marginTop: 12 }}>数字全部来自数据库实时聚合（不是前端统计）；切换 7/30 天会换一个参数重新查一次。</p>
    </div>
  );
}
