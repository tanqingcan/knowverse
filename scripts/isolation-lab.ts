import "./env";
import fs from "node:fs";
import { Client } from "pg";

/**
 * 并发异常实验室
 *
 * 用两个真实连接、按确定的交错顺序，逐一复现课本上的并发异常，并验证 PostgreSQL 的隔离级别行为：
 *   1. 丢失更新（READ COMMITTED）+ SELECT ... FOR UPDATE 的修复
 *   2. 不可重复读（READ COMMITTED vs REPEATABLE READ）
 *   3. 幻读（READ COMMITTED vs REPEATABLE READ）
 *   4. 写偏移（REPEATABLE READ 允许 vs SERIALIZABLE 拒绝，40001）
 *   5. 咨询锁（pg_try_advisory_lock）做领导者选举
 *
 * 用法：
 *   npm run lab:isolation          # 跑实验，写 docs/sql/isolation-lab.md
 *   npx tsx scripts/isolation-lab.ts --check   # 断言预期行为（CI 用）
 */

const URL_DB = process.env.DATABASE_URL!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { name: string; expect: string; actual: string; ok: boolean };

async function clients(): Promise<[Client, Client]> {
  const a = new Client({ connectionString: URL_DB });
  const b = new Client({ connectionString: URL_DB });
  await a.connect();
  await b.connect();
  return [a, b];
}

async function setup() {
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  await c.query(`DROP SCHEMA IF EXISTS lab CASCADE`);
  await c.query(`CREATE SCHEMA lab`);
  await c.query(`CREATE TABLE lab.counter (id int PRIMARY KEY, value int NOT NULL)`);
  await c.query(`INSERT INTO lab.counter VALUES (1, 100)`);
  await c.query(`CREATE TABLE lab.bookings (id serial PRIMARY KEY, slot text NOT NULL)`);
  await c.query(`CREATE TABLE lab.oncall (id int PRIMARY KEY, name text NOT NULL, active boolean NOT NULL)`);
  await c.query(`INSERT INTO lab.oncall VALUES (1, 'A', true), (2, 'B', true)`);
  await c.end();
}

async function resetCounter() {
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  await c.query(`UPDATE lab.counter SET value = 100 WHERE id = 1`);
  await c.query(`TRUNCATE lab.bookings`);
  await c.query(`UPDATE lab.oncall SET active = true`);
  await c.end();
}

async function q1(c: Client, sql: string) {
  const r = await c.query(sql);
  return r.rows[0];
}

async function experimentLostUpdate(): Promise<Row[]> {
  const [a, b] = await clients();
  await resetCounter();
  await a.query("BEGIN");
  await b.query("BEGIN");
  const av = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);
  const bv = Number((await q1(b, `SELECT value FROM lab.counter WHERE id = 1`)).value);
  await a.query(`UPDATE lab.counter SET value = $1 WHERE id = 1`, [av + 10]);
  await a.query("COMMIT");
  await b.query(`UPDATE lab.counter SET value = $1 WHERE id = 1`, [bv + 10]);
  await b.query("COMMIT");
  const final = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);

  // 修复：SELECT ... FOR UPDATE
  await resetCounter();
  await a.query("BEGIN");
  const lock = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1 FOR UPDATE`)).value);
  const blocked = b.query(`SELECT value FROM lab.counter WHERE id = 1 FOR UPDATE`); // 会阻塞
  await sleep(150);
  await a.query(`UPDATE lab.counter SET value = $1 WHERE id = 1`, [lock + 10]);
  await a.query("COMMIT");
  const bRow = (await blocked).rows[0];
  await b.query(`UPDATE lab.counter SET value = $1 WHERE id = 1`, [Number(bRow.value) + 10]);
  await b.query("COMMIT");
  const fixed = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);

  await a.end(); await b.end();
  return [
    { name: "丢失更新（READ COMMITTED，无锁）", expect: "110（B 覆盖了 A 的更新）", actual: String(final), ok: final === 110 },
    { name: "丢失更新（SELECT … FOR UPDATE）", expect: "120（串行化，无丢失）", actual: String(fixed), ok: fixed === 120 },
  ];
}

async function experimentNonRepeatable(): Promise<Row[]> {
  const [a, b] = await clients();
  await resetCounter();
  await a.query("BEGIN");
  const first = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);
  await b.query(`UPDATE lab.counter SET value = 130 WHERE id = 1`);
  const second = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);
  await a.query("COMMIT");

  await resetCounter();
  await a.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  const rrFirst = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);
  await b.query(`UPDATE lab.counter SET value = 130 WHERE id = 1`);
  const rrSecond = Number((await q1(a, `SELECT value FROM lab.counter WHERE id = 1`)).value);
  await a.query("COMMIT");

  await a.end(); await b.end();
  return [
    { name: "不可重复读（READ COMMITTED）", expect: `两次读到不同值：${first} → 130`, actual: `${first} → ${second}`, ok: first === 100 && second === 130 },
    { name: "不可重复读（REPEATABLE READ）", expect: `两次读到相同值：${rrFirst} → ${rrFirst}`, actual: `${rrFirst} → ${rrSecond}`, ok: rrFirst === 100 && rrSecond === 100 },
  ];
}

async function experimentPhantom(): Promise<Row[]> {
  const [a, b] = await clients();
  await resetCounter();
  await a.query("BEGIN");
  const c1 = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.bookings WHERE slot = 'x'`)).n);
  await b.query(`INSERT INTO lab.bookings (slot) VALUES ('x')`);
  const c2 = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.bookings WHERE slot = 'x'`)).n);
  await a.query("COMMIT");

  await resetCounter();
  await a.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  const r1 = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.bookings WHERE slot = 'x'`)).n);
  await b.query(`INSERT INTO lab.bookings (slot) VALUES ('x')`);
  const r2 = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.bookings WHERE slot = 'x'`)).n);
  await a.query("COMMIT");

  await a.end(); await b.end();
  return [
    { name: "幻读（READ COMMITTED）", expect: "第一次 0，第二次 1", actual: `${c1} → ${c2}`, ok: c1 === 0 && c2 === 1 },
    { name: "幻读（REPEATABLE READ）", expect: "两次都是 0（快照隔离）", actual: `${r1} → ${r2}`, ok: r1 === 0 && r2 === 0 },
  ];
}

async function experimentWriteSkew(): Promise<Row[]> {
  const [a, b] = await clients();
  await resetCounter();
  await a.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await b.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  const aCount = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.oncall WHERE active`)).n);
  const bCount = Number((await q1(b, `SELECT count(*)::int AS n FROM lab.oncall WHERE active`)).n);
  await a.query(`UPDATE lab.oncall SET active = false WHERE id = 1`);
  await b.query(`UPDATE lab.oncall SET active = false WHERE id = 2`);
  await a.query("COMMIT");
  await b.query("COMMIT");
  const left = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.oncall WHERE active`)).n);

  // SERIALIZABLE：同样的交错，后提交者应收到 40001
  await resetCounter();
  await a.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await b.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await q1(a, `SELECT count(*)::int AS n FROM lab.oncall WHERE active`);
  await q1(b, `SELECT count(*)::int AS n FROM lab.oncall WHERE active`);
  await a.query(`UPDATE lab.oncall SET active = false WHERE id = 1`);
  await b.query(`UPDATE lab.oncall SET active = false WHERE id = 2`);
  await a.query("COMMIT");
  let serialError = "无错误（不应发生）";
  try {
    await b.query("COMMIT");
  } catch (e: any) {
    serialError = e.code ?? String(e.message);
  }
  const serialLeft = Number((await q1(a, `SELECT count(*)::int AS n FROM lab.oncall WHERE active`)).n);

  await a.end(); await b.end();
  return [
    { name: "写偏移（REPEATABLE READ）", expect: "两人都看到 2 人值班，各自下线 → 最终 0 人", actual: `两人看到 ${aCount}/${bCount}，最终 ${left} 人`, ok: aCount === 2 && bCount === 2 && left === 0 },
    { name: "写偏移（SERIALIZABLE）", expect: "后提交者 40001，最终仍 1 人", actual: `${serialError}，最终 ${serialLeft} 人`, ok: serialError === "40001" && serialLeft === 1 },
  ];
}

async function experimentAdvisoryLock(): Promise<Row[]> {
  const [a, b] = await clients();
  const a1 = (await q1(a, `SELECT pg_try_advisory_lock(42) AS ok`)).ok;
  const b1 = (await q1(b, `SELECT pg_try_advisory_lock(42) AS ok`)).ok;
  await a.query(`SELECT pg_advisory_unlock(42)`);
  const b2 = (await q1(b, `SELECT pg_try_advisory_lock(42) AS ok`)).ok;
  await b.query(`SELECT pg_advisory_unlock(42)`);
  await a.end(); await b.end();
  return [
    { name: "咨询锁（同一时刻只有一个持有者）", expect: "A 拿到，B 拿不到；A 释放后 B 能拿到", actual: `A=${a1} B=${b1} 释放后B=${b2}`, ok: a1 === true && b1 === false && b2 === true },
  ];
}

async function main() {
  await setup();
  const rows: Row[] = [
    ...(await experimentLostUpdate()),
    ...(await experimentNonRepeatable()),
    ...(await experimentPhantom()),
    ...(await experimentWriteSkew()),
    ...(await experimentAdvisoryLock()),
  ];

  const check = process.argv.includes("--check");
  const failed = rows.filter((r) => !r.ok);
  if (check) {
    for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name}：${r.actual}`);
    if (failed.length) {
      console.error(`\n${failed.length} 项与预期不符：${failed.map((f) => f.name).join("、")}`);
      process.exit(1);
    }
    console.log(`\n✓ ${rows.length} 项并发行为全部符合预期`);
    return;
  }

  const md = [
    "# 并发异常实验室（实测）",
    "",
    `> 由 \`npm run lab:isolation\` 于 ${new Date().toISOString()} 生成。两个真实连接按固定交错执行，`,
    "> 不是理论推演；数字与错误码来自 PostgreSQL 16.14 的实际返回。",
    "",
    "| 实验 | 预期 | 实际 | 结果 |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.expect} | ${r.actual} | ${r.ok ? "✅" : "❌"} |`),
    "",
    "## 结论",
    "",
    "1. **READ COMMITTED** 是 PostgreSQL 默认级别：每条语句看最新快照，因此会出现丢失更新、不可重复读与幻读。",
    "2. **REPEATABLE READ** 在 PG 里是快照隔离：同一事务内读到的数据不变，幻读也消失；但**写偏移**仍可能发生（两个事务各写自己的行，没有写写冲突）。",
    "3. **SERIALIZABLE** 用 SSI 检测危险结构，写偏移的后者提交时收到 `40001`，需要应用重试。",
    "4. 本项目对应的取舍：",
    "   - 作答结算用 `SELECT … FOR UPDATE` + 唯一索引，等价于“对同一行/同一键串行化”；",
    "   - 共学名额用触发器内 `FOR UPDATE` 锁小组行，避免“先查后插”的竞态；",
    "   - 对话生成不在事务里，失败重试靠状态机（`pending → failed → pending`）而不是隔离级别；",
    "   - 需要跨行不变量的地方（如班级容量）把规则放进数据库，而不是靠 SERIALIZABLE 全局重试。",
    "",
    "```bash",
    "npm run lab:isolation -- --check   # CI 里断言这些行为没有被改坏",
    "```",
  ].join("\n");
  fs.mkdirSync("docs/sql", { recursive: true });
  fs.writeFileSync("docs/sql/isolation-lab.md", md + "\n", "utf8");

  for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name}：${r.actual}`);
  console.log(`\n✓ 已写入 docs/sql/isolation-lab.md（${rows.filter((r) => r.ok).length}/${rows.length} 符合预期）`);

  // 清理实验 schema，不留垃圾对象
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  await c.query(`DROP SCHEMA IF EXISTS lab CASCADE`);
  await c.end();

  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
