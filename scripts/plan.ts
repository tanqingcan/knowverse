import "./env";
import { q, q1 } from "@/db";

/**
 * 命令行版学习路线规划：
 *   npm run plan -- --handle demo --goal 贝叶斯公式
 *   npm run plan -- --handle demo --goal 贝叶斯公式 --json
 *
 * 打印的不是“所有先修”，而是“按拓扑序 + 你的阶段/错题加权后的下一步”。
 */
async function main() {
  const argv = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const handle = arg("--handle", "demo")!;
  const goalName = arg("--goal");
  const limit = Number(arg("--limit", "12"));
  const json = argv.includes("--json");

  if (!goalName) {
    console.error("用法：npm run plan -- --handle demo --goal 贝叶斯公式 [--limit 12] [--json]");
    process.exit(1);
  }
  const user = await q1<{ id: string; display_name: string }>(`SELECT id, display_name FROM users WHERE handle = $1`, [handle]);
  if (!user) { console.error(`找不到用户 ${handle}`); process.exit(1); }
  const goal = await q1<{ id: string; name: string }>(
    `SELECT id, name FROM concepts WHERE name = $1 AND owner_user_id IS NULL`, [goalName]);
  if (!goal) { console.error(`找不到知识点 ${goalName}`); process.exit(1); }

  const steps = await q<any>(
    `SELECT ord, name, stage, depth, mistakes, reason FROM fn_plan_path($1, $2, $3)`,
    [user.id, goal.id, limit],
  );

  if (json) {
    console.log(JSON.stringify({ user: user.display_name, goal, steps }, null, 2));
    return;
  }
  const rank = ["种子", "嫩芽", "生叶", "花苞", "开花"];
  console.log(`\n${user.display_name} → 目标「${goal.name}」：${steps.length} 步（按先修顺序）\n`);
  for (const s of steps) {
    console.log(`${String(s.ord).padStart(2)}. ${s.name.padEnd(12, "　")} ${rank[["seed","sprout","leaf","bud","bloom"].indexOf(s.stage)]}  ${s.reason}`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
