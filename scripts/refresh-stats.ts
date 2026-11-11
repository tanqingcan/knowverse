import "./env";
import { q } from "@/db";

/** 刷新班级统计物化视图（CONCURRENTLY 不阻塞读；依赖 mv_class_stats_class_id_uq 唯一索引） */
async function main() {
  await q("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_class_stats");
  const rows = await q<{ class_id: string; name: string; member_count: number; shared_planet_count: number }>(
    "SELECT class_id, name, member_count, shared_planet_count FROM mv_class_stats ORDER BY name",
  );
  console.log(`✓ 已刷新 ${rows.length} 个班级的统计`);
  for (const r of rows) console.log(`  · ${r.name}：成员 ${r.member_count}，公开星球 ${r.shared_planet_count}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
