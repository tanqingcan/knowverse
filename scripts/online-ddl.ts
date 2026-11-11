import "./env";
import fs from "node:fs";
import { Client } from "pg";

/**
 * 在线 DDL 实验
 *
 * 大数据表上加索引、加列、加约束，怎样做到“业务不中断”？
 *   1. CREATE INDEX CONCURRENTLY：不阻塞写入（对比普通 CREATE INDEX 会被 lock_timeout 拒绝）
 *   2. 分批回填 + lock_timeout：可中断、可续跑，单批不长时间持锁
 *   3. ADD CONSTRAINT ... NOT VALID + VALIDATE CONSTRAINT：先加元数据后校验，校验期只持弱锁
 *
 * 全程有一个并发写入客户端在跑，记录它的最大延迟与锁等待，用数据而不是口号说明“在线”。
 *
 * 用法：npm run lab:online-ddl [-- --rows 50000]
 */

const ROWS = Number(process.argv[process.argv.indexOf("--rows") + 1] ?? 50000);
const URL_DB = process.env.DATABASE_URL!;
const SCHEMA = "lab_online";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Sample = { action: string; ms: number; note: string };

async function main() {
  const admin = new Client({ connectionString: URL_DB });
  await admin.connect();
  const samples: Sample[] = [];

  // ── 准备：一张有数据的大表 ──
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  await admin.query(`CREATE TABLE ${SCHEMA}.orders (id bigserial PRIMARY KEY, status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  const t0 = Date.now();
  await admin.query(`INSERT INTO ${SCHEMA}.orders (status) SELECT (ARRAY['new','paid','shipped','done'])[1 + (g % 4)] FROM generate_series(1, $1) g`, [ROWS]);
  console.log(`准备 ${ROWS} 行数据：${Date.now() - t0} ms`);

  // ── 并发写入客户端：测量 DDL 期间的最大延迟 ──
  const writer = new Client({ connectionString: URL_DB });
  await writer.connect();
  let writing = true;
  let maxLatency = 0;
  let writes = 0;
  const loop = (async () => {
    while (writing) {
      const id = Math.floor(Math.random() * ROWS) + 1;
      const start = performance.now();
      await writer.query(`UPDATE ${SCHEMA}.orders SET updated_at = now() WHERE id = $1`, [id]);
      maxLatency = Math.max(maxLatency, performance.now() - start);
      writes += 1;
    }
  })();
  await sleep(300); // 让写入先跑起来

  // ── 1. 长事务持锁时，普通 CREATE INDEX 拿不到锁 ──
  const blocker = new Client({ connectionString: URL_DB });
  await blocker.connect();
  await blocker.query("BEGIN");
  await blocker.query(`UPDATE ${SCHEMA}.orders SET status = 'locking' WHERE id = 1`); // 持有 ROW EXCLUSIVE
  let naive = "未执行";
  {
    const c = new Client({ connectionString: URL_DB });
    await c.connect();
    const s = performance.now();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout = '200ms'");
      await c.query(`CREATE INDEX orders_naive_idx ON ${SCHEMA}.orders (updated_at)`);
      await c.query("COMMIT");
      naive = `成功（${Math.round(performance.now() - s)} ms）—— 不应发生`;
    } catch (e: any) {
      await c.query("ROLLBACK").catch(() => {});
      naive = `被拒绝 ${e.code}：${String(e.message).split("\n")[0]}（lock_timeout = 200ms）`;
    }
    await c.end();
  }
  samples.push({ action: "普通 CREATE INDEX（另一个长事务持锁时）", ms: 0, note: naive });
  await blocker.query("ROLLBACK");
  await blocker.end();
  await sleep(100);
  maxLatency = 0; writes = 0; // 单独统计 CONCURRENTLY 阶段的写入延迟（前面的 200ms 是行锁阻塞）

  // ── 2. CREATE INDEX CONCURRENTLY：写入继续 ──
  {
    const s = performance.now();
    await admin.query(`CREATE INDEX CONCURRENTLY orders_updated_idx ON ${SCHEMA}.orders (updated_at)`);
    samples.push({
      action: "CREATE INDEX CONCURRENTLY",
      ms: Math.round(performance.now() - s),
      note: `并发写入 ${writes} 次，最大延迟 ${Math.round(maxLatency)} ms`,
    });
  }

  // ── 3. 加列 + 分批回填（每批 2000 行，lock_timeout 200ms）──
  {
    const s = performance.now();
    await admin.query(`ALTER TABLE ${SCHEMA}.orders ADD COLUMN bucket int`);
    let batches = 0;
    let maxBatchMs = 0;
    const b0 = maxLatency;
    for (;;) {
      const t = performance.now();
      const r = await admin.query(
        `WITH pick AS (SELECT id FROM ${SCHEMA}.orders WHERE bucket IS NULL LIMIT 2000 FOR UPDATE SKIP LOCKED)
         UPDATE ${SCHEMA}.orders o SET bucket = (o.id % 10)::int FROM pick WHERE o.id = pick.id`,
      );
      batches += 1;
      maxBatchMs = Math.max(maxBatchMs, performance.now() - t);
      if (!r.rowCount) break;
      await sleep(10);
      if (batches > 100) break;
    }
    samples.push({
      action: "加列 + 分批回填",
      ms: Math.round(performance.now() - s),
      note: `${batches} 批，单批最长 ${Math.round(maxBatchMs)} ms，并发写入最大延迟 ${Math.round(b0)} → ${Math.round(maxLatency)} ms`,
    });
  }

  // ── 4. NOT VALID 约束 + VALIDATE ──
  {
    const s = performance.now();
    await admin.query(`ALTER TABLE ${SCHEMA}.orders ADD CONSTRAINT orders_bucket_ck CHECK (bucket BETWEEN 0 AND 9) NOT VALID`);
    const added = Math.round(performance.now() - s);
    const v = performance.now();
    await admin.query(`ALTER TABLE ${SCHEMA}.orders VALIDATE CONSTRAINT orders_bucket_ck`);
    samples.push({
      action: "ADD CONSTRAINT NOT VALID + VALIDATE",
      ms: Math.round(performance.now() - s),
      note: `加约束 ${added} ms（仅元数据），校验 ${Math.round(performance.now() - v)} ms（SHARE UPDATE EXCLUSIVE，不阻塞写入）`,
    });
  }

  writing = false;
  await loop;
  await writer.end();

  // 一致性核对
  const check = await admin.query(`SELECT count(*)::int AS total, count(bucket)::int AS filled, count(*) FILTER (WHERE bucket IS NULL)::int AS nulls FROM ${SCHEMA}.orders`);
  const idx = await admin.query(`SELECT indexrelid::regclass::text AS name FROM pg_index WHERE indrelid = '${SCHEMA}.orders'::regclass AND NOT indisprimary`);

  const md = [
    "# 在线 DDL 实测",
    "",
    `> 由 \`npm run lab:online-ddl\` 于 ${new Date().toISOString()} 生成。表：${SCHEMA}.orders，${ROWS} 行；全程有并发写入客户端。`,
    "",
    "| 操作 | 耗时 | 说明 |",
    "|---|---|---|",
    ...samples.map((s) => `| ${s.action} | ${s.ms ? s.ms + " ms" : "—"} | ${s.note} |`),
    "",
    "## 结论",
    "",
    "1. **普通 `CREATE INDEX`** 持 `SHARE` 锁，期间写入被阻塞；设置 `lock_timeout` 后直接被拒绝（`55P03`）——这就是线上不能在业务高峰直接建索引的原因。",
    "2. **`CREATE INDEX CONCURRENTLY`** 分两阶段扫描并等待旧事务结束，不阻塞写入；代价是更慢、且不能在事务块里执行、失败会留下 `INVALID` 索引需要重建。",
    "3. **加列** 在 PG 11+ 是纯元数据操作（默认值不重写表）；**回填**要分批 + `lock_timeout` + `SKIP LOCKED`，可中断、可续跑。",
    "4. **加约束** 用 `NOT VALID` 先拿元数据锁（毫秒级），再用 `VALIDATE CONSTRAINT` 以弱锁校验历史行，避免长时间 `ACCESS EXCLUSIVE`。",
    "",
    "## 一致性核对",
    "",
    `- 行数 ${check.rows[0].total}，已回填 ${check.rows[0].filled}，未回填 ${check.rows[0].nulls}`,
    `- 新建索引：${idx.rows.map((r: any) => r.name).join(", ")}`,
    "",
    "```bash",
    "npm run lab:online-ddl -- --rows 50000",
    "```",
  ].join("\n");

  fs.mkdirSync("docs/sql", { recursive: true });
  fs.writeFileSync("docs/sql/online-ddl.md", md + "\n", "utf8");

  for (const s of samples) console.log(`${s.ms ? s.ms + " ms" : "—"}  ${s.action}\n    ${s.note}`);
  console.log(`\n核对：${check.rows[0].filled}/${check.rows[0].total} 已回填；索引 ${idx.rows.map((r: any) => r.name).join(", ")}`);

  await admin.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await admin.end();
  console.log("✓ 已写入 docs/sql/online-ddl.md");
}

main().catch((e) => { console.error(e); process.exit(1); });
