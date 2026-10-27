/**
 * 生成模拟数据并对核心查询执行 EXPLAIN (ANALYZE, BUFFERS)，结果写入 docs/sql/explain-results.md。
 * 使用独立库（默认 knowverse_bench），不会写入开发/演示库。数据为脚本随机生成的模拟问答，不代表真实用户。
 *   npm run explain            # 默认 2 万组问答
 *   BENCH_QA=50000 npm run explain
 */
import "./env";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { Pool } from "pg";

const base = process.env.DATABASE_URL!;
const url = process.env.BENCH_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/knowverse_bench$1");
const N = Number(process.env.BENCH_QA ?? 20000);

async function main() {
  const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL ?? base });
  const name = new URL(url).pathname.slice(1);
  const ex = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [name]);
  if (!ex.rowCount) await admin.query(`CREATE DATABASE "${name.replace(/"/g, "")}"`);
  await admin.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx tsx scripts/reset.ts && npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts", { env, stdio: "pipe" });

  const pool = new Pool({ connectionString: url });
  const user = (await pool.query(`SELECT id FROM users WHERE handle = 'demo'`)).rows[0].id;
  const other = (await pool.query(`SELECT id FROM users WHERE handle = 'xingye'`)).rows[0].id;
  const concepts = (await pool.query(`SELECT id, name FROM concepts WHERE owner_user_id IS NULL`)).rows;
  console.log(`生成 ${N} 组模拟问答（演示用户与另一用户各一半）…`);
  const words = ["连接", "外连接", "左外连接", "条件概率", "贝叶斯", "事务", "索引", "范式", "函数依赖", "分组", "聚合", "LEFT JOIN", "INNER JOIN", "GROUP BY", "WHERE", "NULL", "样本空间", "随机变量", "独立性", "全概率"];
  const t0 = Date.now();
  await pool.query(`
    WITH gen AS (
      SELECT g, CASE WHEN g % 2 = 0 THEN $1::uuid ELSE $2::uuid END AS uid,
             now() - make_interval(mins => (g * 7) % 525600) AS at
      FROM generate_series(1, $3::int) g),
    conv AS (
      INSERT INTO conversations (user_id, title, created_at, updated_at, origin)
      SELECT uid, '模拟会话 ' || g || ' ' || ($4::text[])[1 + g % 20], at, at, 'seed' FROM gen RETURNING id, user_id, created_at),
    numbered AS (SELECT c.*, row_number() OVER () AS rn FROM conv c),
    q AS (
      INSERT INTO messages (conversation_id, user_id, seq, role, content, created_at)
      SELECT id, user_id, 1, 'user', '模拟问题 ' || rn || '：关于' || ($4::text[])[1 + (rn / 2) % 20] || '与' || ($4::text[])[1 + (rn * 3 / 2) % 20] || '的疑问，' || md5(rn::text), created_at FROM numbered
      RETURNING id, conversation_id, user_id, created_at)
    INSERT INTO messages (conversation_id, user_id, seq, role, content, reply_to_id, mode, created_at)
    SELECT conversation_id, user_id, 2, 'assistant', '模拟回答：' || md5(id::text) || ' ' || repeat('解释文字', 20), id, 'demo', created_at FROM q`,
    [user, other, N, words]);
  await pool.query(`INSERT INTO message_concepts (message_id, concept_id, source, status)
                    SELECT m.id, ($1::uuid[])[1 + (abs(hashtext(m.id::text)) % array_length($1::uuid[], 1))], 'ai', 'candidate'
                    FROM messages m WHERE m.role = 'user' ON CONFLICT DO NOTHING`, [concepts.map((c) => c.id)]);
  await pool.query(`ANALYZE`);
  const counts = (await pool.query(`SELECT (SELECT count(*) FROM messages) m, (SELECT count(*) FROM conversations) c, (SELECT count(*) FROM message_concepts) mc`)).rows[0];
  console.log(`数据生成 ${(Date.now() - t0) / 1000}s`, counts);

  const { buildHistorySql } = await import("../src/server/history");
  const lj = concepts.find((c) => c.name === "左外连接").id;
  const cases: [string, any][] = [
    ["Q1 关键词（英文短语，≥3 字符，可用 trigram 索引）", { keyword: "LEFT JOIN", page: 1, pageSize: 10 }],
    ["Q2 关键词（中文四字词）", { keyword: "条件概率", page: 1, pageSize: 10 }],
    ["Q3 关键词（中文两字词，短于 trigram，需要扫描用户的消息）", { keyword: "索引", page: 1, pageSize: 10 }],
    ["Q4 日期范围 + 知识点", { from: "2026-01-01", to: "2026-03-31", conceptIds: [lj], page: 1, pageSize: 10 }],
    ["Q5 关键词 + 日期 + 知识点组合", { keyword: "LEFT JOIN", from: "2026-01-01", to: "2026-12-31", conceptIds: [lj], page: 1, pageSize: 10 }],
  ];
  let md = `# EXPLAIN ANALYZE 结果（自动生成）\n\n> 由 \`npm run explain\` 于 ${new Date().toISOString()} 生成。数据为脚本随机生成的**模拟问答**，不代表真实用户或真实负载；数字只用于比较同一环境下不同方案，不应作为性能承诺。\n\n`;
  const ver = (await pool.query(`SELECT version()`)).rows[0].version;
  md += `- 环境：${ver}\n- 机器：${os.cpus()[0]?.model ?? "unknown"} × ${os.cpus().length}，内存 ${(os.totalmem() / 2 ** 30).toFixed(1)} GB（开发容器）\n- 数据量：conversations ${counts.c}，messages ${counts.m}，message_concepts ${counts.mc}（两名用户各约一半）\n- 查询语句与应用代码相同：由 \`src/server/history.ts\` 的 \`buildHistorySql\` 生成，参数化执行。\n\n`;
  for (const [title, input] of cases) {
    const { text, params } = buildHistorySql(input, user, "Asia/Taipei");
    const run = async (label: string, pre: string[]) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        for (const p of pre) await c.query(p);
        await c.query({ text: `EXPLAIN (ANALYZE, BUFFERS) ${text}`, values: params as any[] }); // 预热
        const r = await c.query({ text: `EXPLAIN (ANALYZE, BUFFERS) ${text}`, values: params as any[] });
        await c.query("ROLLBACK");
        const plan = r.rows.map((x) => x["QUERY PLAN"]).join("\n");
        const exec = plan.match(/Execution Time: ([\d.]+) ms/)?.[1];
        return { label, plan, exec };
      } finally { c.release(); }
    };
    const a = await run("默认（使用索引）", []);
    const b = await run("对照：关闭位图/索引扫描", ["SET LOCAL enable_bitmapscan = off", "SET LOCAL enable_indexscan = off"]);
    md += `## ${title}\n\n参数：\`${JSON.stringify(input)}\`\n\n| 方案 | Execution Time |\n|---|---|\n| ${a.label} | ${a.exec} ms |\n| ${b.label} | ${b.exec} ms |\n\n<details><summary>默认方案执行计划</summary>\n\n\`\`\`\n${a.plan}\n\`\`\`\n</details>\n\n`;
    console.log(title, a.exec, "ms /", b.exec, "ms");
  }
  fs.writeFileSync("docs/sql/explain-results.md", md);
  await pool.end();
  console.log("✓ 写入 docs/sql/explain-results.md");
}
main().catch((e) => { console.error(e); process.exit(1); });
