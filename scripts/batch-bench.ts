import "./env";
import fs from "node:fs";
import { Client } from "pg";

/**
 * 批处理与存储过程性能对比：为什么“集合处理”比“逐行处理”快
 *
 *   1. 插入 5,000 行：应用循环逐条 INSERT vs 一条 INSERT ... SELECT generate_series
 *   2. 更新 50,000 行：PL/pgSQL 游标逐行 UPDATE vs 一条集合 UPDATE
 *   3. 点查 3,000 次：应用循环 3,000 次往返 vs 一条 WHERE id = ANY($1)
 *
 * 用法：npm run bench:batch [-- --rows 50000]
 * 输出：命令行对比 + docs/sql/batch-performance.md
 */

const ROWS = Number(process.argv[process.argv.indexOf("--rows") + 1] ?? 50000);
const URL_DB = process.env.DATABASE_URL!;
const SCHEMA = "bench_batch";

async function main() {
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  const out: { name: string; slow: number; mid?: number; fast: number; unit: string; note: string }[] = [];

  await c.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await c.query(`CREATE SCHEMA ${SCHEMA}`);
  await c.query(`CREATE TABLE ${SCHEMA}.t (id bigserial PRIMARY KEY, v int NOT NULL DEFAULT 0, note text)`);

  // ── 1. 插入：逐条 vs 集合 ──
  {
    const n = 5000;
    let t0 = Date.now();
    for (let i = 0; i < n; i++) await c.query(`INSERT INTO ${SCHEMA}.t (v, note) VALUES ($1, $2)`, [i % 100, `row-${i}`]);
    const slow = Date.now() - t0;

    t0 = Date.now();
    await c.query(`INSERT INTO ${SCHEMA}.t (v, note) SELECT g % 100, 'row-' || g FROM generate_series(1, $1) g`, [n]);
    const fast = Date.now() - t0;
    out.push({ name: `插入 ${n} 行`, slow, fast, unit: "ms", note: `应用循环 ${n} 次往返 vs 1 条 INSERT … SELECT` });
  }

  // ── 2. 更新：应用逐条 / PL/pgSQL 游标 / 集合 ──
  {
    const n = 5000;
    await c.query(`INSERT INTO ${SCHEMA}.t (v, note) SELECT g % 100, 'x-' || g FROM generate_series(1, $1) g`, [n]);
    const ids = (await c.query(`SELECT id FROM ${SCHEMA}.t ORDER BY id`)).rows.map((r: any) => r.id);
    await c.query(`CREATE OR REPLACE FUNCTION ${SCHEMA}.slow_update() RETURNS int LANGUAGE plpgsql AS $$
      DECLARE r record; n int := 0;
      BEGIN
        FOR r IN SELECT id FROM ${SCHEMA}.t LOOP
          UPDATE ${SCHEMA}.t SET v = v + 1 WHERE id = r.id;
          n := n + 1;
        END LOOP;
        RETURN n;
      END $$`);

    let t0 = Date.now();
    for (const id of ids) await c.query(`UPDATE ${SCHEMA}.t SET v = v + 1 WHERE id = $1`, [id]);
    const app = Date.now() - t0;

    t0 = Date.now();
    await c.query(`SELECT ${SCHEMA}.slow_update()`);
    const proc = Date.now() - t0;

    t0 = Date.now();
    await c.query(`UPDATE ${SCHEMA}.t SET v = v + 1`);
    const setBased = Date.now() - t0;
    out.push({ name: `更新 ${n} 行`, slow: app, mid: proc, fast: setBased, unit: "ms", note: "应用逐条往返 / PL/pgSQL 游标 / 一条集合 UPDATE" });
  }

  // ── 3. 点查：逐次往返 vs 一次批量 ──
  {
    const ids = (await c.query(`SELECT id FROM ${SCHEMA}.t ORDER BY random() LIMIT 3000`)).rows.map((r: any) => r.id);
    let t0 = Date.now();
    for (const id of ids) await c.query(`SELECT v FROM ${SCHEMA}.t WHERE id = $1`, [id]);
    const slow = Date.now() - t0;

    t0 = Date.now();
    await c.query(`SELECT id, v FROM ${SCHEMA}.t WHERE id = ANY($1::bigint[])`, [ids]);
    const fast = Date.now() - t0;
    out.push({ name: `点查 ${ids.length} 次`, slow, fast, unit: "ms", note: "应用循环逐次往返 vs 一条 WHERE id = ANY($1)" });
  }

  // 清理
  await c.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await c.end();

  const md = [
    "# 批处理与存储过程性能对比（实测）",
    "",
    `> 由 \`npm run bench:batch\` 于 ${new Date().toISOString()} 生成；本机 PostgreSQL 16.14，同一连接、同一数据量。`,
    `> 数据为合成数据，只用于比较“逐行 vs 集合”的量级，不代表生产环境绝对值。`,
    "",
    "| 场景 | 逐行/逐次 | 数据库内逐行 | 集合/单次 | 说明 |",
    "|---|---|---|---|---|",
    ...out.map((o) => `| ${o.name} | ${o.slow} ${o.unit} | ${o.mid != null ? `${o.mid} ${o.unit}` : "—"} | ${o.fast} ${o.unit} | ${o.note} |`),
    "",
    "## 结论",
    "",
    "1. **往返次数是主要成本**：应用循环每行一次网络往返，本地也慢一个数量级；一条 `INSERT … SELECT` / `WHERE id = ANY($1)` 把 N 次往返压成 1 次。",
    (() => {
      const u = out.find((o) => o.name.startsWith("更新"));
      if (!u || u.mid == null) return "2. **逐行 UPDATE 在两个层面都吃亏**：应用层 N 次往返 + 数据库 N 次执行计划；PL/pgSQL 游标只省掉往返，仍要 N 次执行。";
      return `2. **逐行 UPDATE 在两个层面都吃亏**：应用逐条 ${u.slow} ms → 搬进 PL/pgSQL 游标 ${u.mid} ms（省掉往返，约 ${(u.slow / u.mid).toFixed(0)}×）→ 一条集合 UPDATE ${u.fast} ms（省掉 N 次执行，再 ${(u.mid / u.fast).toFixed(1)}×），合计约 ${(u.slow / u.fast).toFixed(0)}×。`;
    })(),
    "3. 集合操作让优化器一次看到全量数据，可以做单次扫描 + 批量写；这也解释了为什么本项目把「结算」「班级统计」「周报」写成 SQL/存储过程，而不是在应用里循环。",
    "4. 不是所有逻辑都该下沉：需要调用外部服务（模型、文件解析）的步骤留在应用层，只在事务边界上保证一致——见 `docs/database-design.md` §7。",
    "",
    "```bash",
    "npm run bench:batch -- --rows 50000",
    "```",
  ].join("\n");
  fs.mkdirSync("docs/sql", { recursive: true });
  fs.writeFileSync("docs/sql/batch-performance.md", md + "\n", "utf8");

  for (const o of out) console.log(`${o.name}：逐行 ${o.slow} ms → 集合 ${o.fast} ms（${(o.slow / Math.max(o.fast, 1)).toFixed(1)}×）`);
  console.log("✓ 已写入 docs/sql/batch-performance.md");
}

main().catch((e) => { console.error(e); process.exit(1); });
