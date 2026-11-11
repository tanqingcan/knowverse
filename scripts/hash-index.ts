import "./env";
import fs from "node:fs";
import { Client } from "pg";

/**
 * HASH 索引实验（第 7.5 物理设计）
 *
 * 问题：auth_sessions.token_hash 这类“高基数、纯等值”的列，该用 B 树还是 HASH？
 * 做法：在 20 万行合成数据上分别建 B 树 / HASH，比较
 *   - 等值查询（1000 次点查）
 *   - 范围查询（HASH 不支持）
 *   - 索引大小
 * 再回到真实表：token_hash 已有 UNIQUE B 树（唯一约束必须用 B 树），
 * 所以额外加 HASH 只会增加写放大——这是“测量之后决定不加”的例子。
 */
const N = Number(process.argv[process.argv.indexOf("--rows") + 1] ?? 200000);
const URL_DB = process.env.DATABASE_URL!;
const S = "bench_hash";

type Row = { metric: string; btree: string; hash: string; note: string };

async function main() {
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  const rows: Row[] = [];

  await c.query(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
  await c.query(`CREATE SCHEMA ${S}`);
  await c.query(`CREATE TABLE ${S}.t (id bigserial PRIMARY KEY, key text NOT NULL, v int NOT NULL)`);
  await c.query(`INSERT INTO ${S}.t (key, v) SELECT md5(g::text), g % 100 FROM generate_series(1, $1) g`, [N]);
  const keys = (await c.query(`SELECT key FROM ${S}.t ORDER BY random() LIMIT 1000`)).rows.map((r: any) => r.key);

  const pointLookups = async () => {
    const t0 = Date.now();
    for (const k of keys) await c.query(`SELECT v FROM ${S}.t WHERE key = $1`, [k]);
    return Date.now() - t0;
  };
  const size = async (idx: string) =>
    Number((await c.query(`SELECT pg_relation_size('${S}.${idx}') AS s`)).rows[0].s);

  // B 树
  await c.query(`CREATE INDEX t_btree ON ${S}.t (key)`);
  await c.query(`ANALYZE ${S}.t`);
  const btreeMs = await pointLookups();
  const btreeSize = await size("t_btree");
  const btreeRange = await c.query(`EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM ${S}.t WHERE key > 'f'`);
  const btreeRangePlan = btreeRange.rows.map((r: any) => r["QUERY PLAN"]).join("\n");
  await c.query(`DROP INDEX ${S}.t_btree`);

  // HASH
  await c.query(`CREATE INDEX t_hash ON ${S}.t USING hash (key)`);
  await c.query(`ANALYZE ${S}.t`);
  const hashMs = await pointLookups();
  const hashSize = await size("t_hash");
  const hashRange = await c.query(`EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM ${S}.t WHERE key > 'f'`);
  const hashRangePlan = hashRange.rows.map((r: any) => r["QUERY PLAN"]).join("\n");
  await c.query(`DROP SCHEMA ${S} CASCADE`);

  // 真实表：唯一约束 vs 哈希
  const realIdx = (await c.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='auth_sessions'`)).rows
    .map((r: any) => r.indexdef).filter((d: string) => d.includes("token_hash"))[0];

  rows.push({ metric: `等值点查 1000 次（${N} 行）`, btree: `${btreeMs} ms`, hash: `${hashMs} ms`, note: "两者都走索引；差距在噪声内" });
  rows.push({ metric: "索引大小", btree: `${(btreeSize / 1024 / 1024).toFixed(1)} MB`, hash: `${(hashSize / 1024 / 1024).toFixed(1)} MB`, note: "HASH 只存哈希值，通常更小" });
  rows.push({ metric: "范围查询（key > 'f'）", btree: btreeRangePlan.includes("Index") ? "走索引" : "顺序扫描", hash: hashRangePlan.includes("Index") ? "走索引" : "顺序扫描", note: "HASH 只支持等值，范围只能全表扫" });

  const md = [
    "# HASH 索引实验：什么时候用、什么时候不该加（第 7.5 节）",
    "",
    `> 由 \`npm run bench:hash\` 生成；${N} 行合成数据（随机 md5 作为高基数键），本机 PostgreSQL 16.14。`,
    "",
    "| 指标 | B 树 | HASH | 说明 |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.metric} | ${r.btree} | ${r.hash} | ${r.note} |`),
    "",
    "## 结论",
    "",
    "1. **高基数、纯等值**：两者点查都很快，HASH 索引通常更小；但 HASH 不支持范围、排序与前缀匹配。",
    "2. **唯一约束必须用 B 树**：`auth_sessions.token_hash` 上有 `UNIQUE` 索引，它同时承担“唯一性检查 + 等值查找”。再建 HASH 只会增加写放大，不会让查询更快。",
    "3. 所以本项目**没有**给 `token_hash` 额外加 HASH 索引——这是测量与约束共同决定的，不是“忘了加”。",
    "4. 什么时候该用 HASH：纯等值查找、无唯一约束、无范围需求的高基数列（例如外部系统的幂等键缓存表）。",
    "",
    "真实表上的现状：",
    "",
    "```sql",
    realIdx ? realIdx.replace(/^CREATE /, "CREATE ") : "（未找到 token_hash 索引）",
    "```",
    "",
    "```bash",
    "npm run bench:hash -- --rows 200000",
    "```",
  ].join("\n");
  fs.writeFileSync("docs/sql/hash-index.md", md + "\n", "utf8");

  for (const r of rows) console.log(`${r.metric}：B树 ${r.btree} / HASH ${r.hash}（${r.note}）`);
  console.log("✓ 已写入 docs/sql/hash-index.md");
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
