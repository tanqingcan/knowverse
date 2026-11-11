import "./env";
import { q } from "@/db";

/**
 * 夜间维护（调用存储过程 kv_nightly_maintenance）
 *   npm run maintenance            # 默认 7 天
 *   npm run maintenance -- 30      # 归档超过 30 天的会话纳入统计
 */
async function main() {
  const days = Number(process.argv[2] ?? 7);
  const rows = await q<{ p_report: any }>(`CALL kv_nightly_maintenance($1, NULL)`, [days]);
  const r = rows[0].p_report;
  console.log("\n夜间维护完成（存储过程 + 游标 + 动态 SQL）\n");
  console.log(`  归档超过 ${days} 天的会话：${r.archivedSessions}`);
  console.log(`  超时 pending 消息已标记：${r.staleMessages}`);
  console.log(`  班级统计对账修复：${r.reconciledClassStats} 行`);
  console.log(`  已 ANALYZE：${r.analyzed.join(", ")}`);
  if (r.warnings?.length) console.log(`  警告：${r.warnings.join("；")}`);
  console.log(`  耗时：${r.durationMs} ms\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
