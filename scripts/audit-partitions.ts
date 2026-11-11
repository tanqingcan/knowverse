import "./env";
import { q } from "@/db";

/**
 * 审计表分区维护：按需补建未来几个月的分区（幂等）。
 * 已有 DEFAULT 分区兜底，所以本脚本是“提前分片”，不是“不跑就丢数据”。
 */
function monthStart(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

async function main() {
  const monthsAhead = Number(process.argv[2] ?? 3);
  const now = new Date();
  for (let i = 0; i <= monthsAhead; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const start = monthStart(d.getUTCFullYear(), d.getUTCMonth() + 1);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const end = monthStart(next.getUTCFullYear(), next.getUTCMonth() + 1);
    if (!/^\d{4}-\d{2}-01$/.test(start) || !/^\d{4}-\d{2}-01$/.test(end)) throw new Error("非法分区边界");
    const name = `audit_log_${start.slice(0, 7).replace("-", "_")}`;
    if (!/^audit_log_\d{4}_\d{2}$/.test(name)) throw new Error("非法分区名");
    await q(`CREATE TABLE IF NOT EXISTS ${name} PARTITION OF audit_log FOR VALUES FROM ('${start}') TO ('${end}')`);
  }
  const rows = await q<{ child: string }>(
    `SELECT child.relname AS child FROM pg_inherits JOIN pg_class child ON child.oid = inhrelid
      JOIN pg_class parent ON parent.oid = inhparent WHERE parent.relname = 'audit_log' ORDER BY child.relname`,
  );
  console.log(`✓ 审计分区就绪（${rows.length} 个）：${rows.map((r) => r.child).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
