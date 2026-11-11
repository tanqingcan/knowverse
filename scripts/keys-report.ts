import "./env";
import fs from "node:fs";
import { q } from "@/db";

/**
 * 候选键导出（为规范化分析提供依据）
 *
 * 从 pg_index 里找出每张表的：
 *   - 主键
 *   - 其他完整唯一键（可作候选键）
 *   - 条件唯一键（部分唯一索引，只在满足谓词时唯一）
 * 说明：函数依赖仍需人工判断；本脚本只负责“键”这一半事实。
 *
 * 用法：npm run docs:keys
 */
async function main() {
  const tables = await q<{ relname: string }>(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relispartition
     ORDER BY c.relname`);

  type Key = { name: string; primary: boolean; partial: boolean; expr: boolean; cols: string[] };
  const rows: { table: string; pk: string; uniques: string; partials: string }[] = [];

  for (const t of tables) {
    const idx = await q<{ index_name: string; indisprimary: boolean; partial: boolean; expr: boolean; cols: string[] | null }>(`
      SELECT i.indexrelid::regclass::text AS index_name, i.indisprimary,
             (i.indpred IS NOT NULL) AS partial, (i.indexprs IS NOT NULL) AS expr,
             (SELECT array_agg(a.attname::text ORDER BY k)
                FROM generate_subscripts(i.indkey, 1) k
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[k]) AS cols
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = $1 AND i.indisunique
       ORDER BY i.indisprimary DESC, index_name`, [t.relname]);

    const keys: Key[] = idx.map((r) => ({
      name: r.index_name, primary: r.indisprimary, partial: r.partial, expr: r.expr, cols: r.cols ?? [],
    }));
    const fmt = (k: Key) => `${k.cols.length ? `(${k.cols.join(", ")})` : "（表达式）"}${k.partial ? " *" : ""}`;
    rows.push({
      table: t.relname,
      pk: keys.filter((k) => k.primary).map(fmt).join("；") || "（无）",
      uniques: keys.filter((k) => !k.primary && !k.partial && !k.expr).map(fmt).join("；") || "—",
      partials: keys.filter((k) => k.partial).map(fmt).join("；") || "—",
    });
  }

  const withExtra = rows.filter((r) => r.uniques !== "—").length;
  const lines = [
    "# 候选键清单（自动生成）",
    "",
    "> 由 `npm run docs:keys` 从 `pg_index` 生成。`*` 表示部分唯一索引（条件键），只在谓词成立时唯一。",
    "> 函数依赖与范式判断见 `docs/schema/normalization-analysis.md`。",
    "",
    `表数：${rows.length}；带额外唯一键的表：${withExtra}。`,
    "",
    "| 表 | 主键 | 其他唯一键（完整） | 条件唯一键 |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.table} | ${r.pk} | ${r.uniques} | ${r.partials} |`),
    "",
  ];
  fs.writeFileSync("docs/schema/candidate-keys.md", lines.join("\n"), "utf8");
  console.log(`✓ 已生成 docs/schema/candidate-keys.md（${rows.length} 张表，${withExtra} 张有额外唯一键）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
