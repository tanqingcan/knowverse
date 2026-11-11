import "./env";
import fs from "node:fs";
import path from "node:path";
import { q } from "@/db";

/**
 * 从 information_schema 反向生成数据字典（docs/schema/data-dictionary.md）。
 * 目的：让“文档里的模式”与“数据库里的模式”不会漂移——改完迁移重跑一次即可。
 */
type Col = {
  column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null;
  character_maximum_length: number | null; numeric_precision: number | null; numeric_scale: number | null;
};

function typeOf(c: Col): string {
  if (c.data_type === "ARRAY") return `${c.udt_name.replace(/^_/, "")}[]`;
  if (c.data_type === "character varying") return `varchar(${c.character_maximum_length})`;
  if (c.data_type === "numeric" && c.numeric_precision) return `numeric(${c.numeric_precision},${c.numeric_scale})`;
  return c.data_type;
}
function esc(s: string) { return s.replace(/\|/g, "\\|"); }

async function main() {
  const tables = (await q<{ table_name: string }>(
    `SELECT c.relname AS table_name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      ORDER BY c.relname`,
  )).map((r) => r.table_name);

  const out: string[] = [];
  out.push("# 数据字典（自动生成）");
  out.push("");
  out.push("> 由 `npm run docs:dictionary` 从 `information_schema` / `pg_indexes` 反向生成，**请勿手工编辑**。");
  out.push(`> 生成时间：${new Date().toISOString()}　表数：${tables.length}`);
  out.push("");
  out.push("## 目录");
  out.push("");
  for (const t of tables) out.push(`- [${t}](#${t})`);
  out.push("");

  let colCount = 0;
  for (const t of tables) {
    const cols = await q<Col>(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [t]);
    colCount += cols.length;

    const pk = await q<{ column_name: string }>(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position`, [t]);
    const uniq = await q<{ constraint_name: string; column_name: string }>(
      `SELECT tc.constraint_name, kcu.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.constraint_name, kcu.ordinal_position`, [t]);
    const checks = await q<{ constraint_name: string }>(
      `SELECT tc.constraint_name FROM information_schema.table_constraints tc
         JOIN information_schema.check_constraints cc
           ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'CHECK'
          AND tc.constraint_name NOT LIKE '%_not_null'
          AND cc.check_clause NOT ILIKE '%IS NOT NULL%'
        ORDER BY tc.constraint_name`, [t]);
    // 用 pg_constraint 还原复合外键的列对应关系（information_schema 会做笛卡尔积）
    const fks = await q<{ conname: string; cols: string[]; ftable: string; fcols: string[] }>(
      `SELECT con.conname,
              (SELECT array_agg(a.attname::text ORDER BY k.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols,
              con.confrelid::regclass::text AS ftable,
              (SELECT array_agg(a.attname::text ORDER BY k.ord)
                 FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS fcols
         FROM pg_constraint con
        WHERE con.contype = 'f' AND con.conrelid = ('public.' || quote_ident($1))::regclass
        ORDER BY con.conname`, [t]);
    const idx = await q<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`, [t]);

    out.push(`## ${t}`);
    out.push("");
    out.push("| 列 | 类型 | 可空 | 默认 |");
    out.push("|---|---|---|---|");
    for (const c of cols) {
      out.push(`| ${esc(c.column_name)} | ${esc(typeOf(c))} | ${c.is_nullable === "YES" ? "是" : "否"} | ${c.column_default ? `\`${esc(String(c.column_default)).slice(0, 60)}\`` : ""} |`);
    }
    out.push("");
    if (pk.length) out.push(`- **主键**：${pk.map((x) => `\`${x.column_name}\``).join(", ")}`);
    if (fks.length) out.push(`- **外键**：${fks.map((f) => `(${f.cols.join(", ")}) → ${f.ftable}(${f.fcols.join(", ")})`).join("；")}`);
    const uq = new Map<string, string[]>();
    for (const u of uniq) {
      if (!uq.has(u.constraint_name)) uq.set(u.constraint_name, []);
      uq.get(u.constraint_name)!.push(u.column_name);
    }
    if (uq.size) out.push(`- **唯一约束**：${[...uq.values()].map((g) => `(${g.join(", ")})`).join("；")}`);
    if (checks.length) out.push(`- **CHECK**：${checks.map((c) => `\`${c.constraint_name}\``).join(", ")}`);
    if (idx.length) out.push(`- **索引**：${idx.map((i) => `\`${i.indexname}\``).join(", ")}`);
    out.push("");
    out.push("---");
    out.push("");
  }

  const target = path.resolve(process.cwd(), "docs/schema/data-dictionary.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out.join("\n") + "\n", "utf8");

  const baseTables = `(SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition)`;
  const idxCount = Number((await q<{ n: number }>(
    `SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND tablename IN ${baseTables}`))[0].n);
  const fkCount = Number((await q<{ n: number }>(
    `SELECT count(*)::int n FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY'`))[0].n);
  console.log(`✓ 数据字典已生成：${target}`);
  console.log(`  表 ${tables.length} · 列 ${colCount} · 外键 ${fkCount} · 索引 ${idxCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
