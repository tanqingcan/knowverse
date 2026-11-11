import "./env";
import { q1 } from "@/db";
import { weeklyReport } from "@/server/reports";

/**
 * 命令行版学习周报：
 *   npm run report -- --handle demo
 *   npm run report -- --handle demo --days 30 --json
 */
async function main() {
  const argv = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const handle = arg("--handle", "demo")!;
  const days = Number(arg("--days", "7"));
  const json = argv.includes("--json");

  const row = await q1<any>(`SELECT id, display_name AS "displayName", handle FROM users WHERE handle = $1`, [handle]);
  if (!row) { console.error(`找不到用户 ${handle}`); process.exit(1); }

  const r = await weeklyReport({ id: row.id } as any, { days });
  if (json) { console.log(JSON.stringify(r, null, 2)); return; }

  const rank = ["种子", "嫩芽", "生叶", "花苞", "开花"];
  console.log(`\n${row.displayName}（@${row.handle}） · 最近 ${days} 天  ${r.range.from} ~ ${r.range.to}`);
  console.log(`活跃 ${r.summary.activeDays} 天 · 提问 ${r.summary.questions} · 作答 ${r.summary.attempts} · 开花 ${r.summary.bloomed} 株`);
  console.log(`连续学习：当前 ${r.streak?.current_streak ?? 0} 天，最长 ${r.streak?.longest_streak ?? 0} 天，最近活跃 ${r.streak?.last_active ?? "无"}`);
  const f = r.funnel as any;
  console.log(`阶段漏斗：${rank.map((n, i) => `${n} ${f?.[["seed", "sprout", "leaf", "bud", "bloom"][i]] ?? 0}`).join(" · ")}（共 ${f?.plants ?? 0} 株）`);
  console.log("学科汇总（GROUPING SETS）：");
  for (const s of r.bySubject) console.log(`  ${s.subject.padEnd(14, "　")} 提问 ${s.asked} · 练习 ${s.practice} · 共 ${s.total}`);
  if (r.classRank) console.log(`班级排名：第 ${r.classRank.rnk}/${r.classRank.total} 名，超过 ${Math.round(r.classRank.percentile * 100)}% 的同学（证据 ${r.classRank.evidenceCount} 条，班级「${r.classRank.className}」）`);
  if (r.topMistakes.length) {
    console.log("错题 TOP（最近 30 天）：");
    for (const m of r.topMistakes) console.log(`  #${m.rnk} ${m.concept}：${m.mistakes} 次`);
  }
  console.log("每日活动：");
  for (const d of r.daily) {
    const total = d.questions + d.attempts + d.evidences + d.notes;
    console.log(`  ${d.date}  ${"▇".repeat(Math.min(total, 20))}${total ? ` ${total}` : ""}`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
