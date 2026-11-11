import "./env";
import { q, q1 } from "@/db";

/**
 * CDC：用 PostgreSQL 逻辑解码消费 outbox_events
 *
 * 为什么这样做：outbox 表已经是“事务内写入、事务外投递”的标准模式，但之前没有消费者
 * （所以不变量检查里 W1 一直报警）。这里用逻辑复制槽 + test_decoding 插件，直接从 WAL
 * 里解码 INSERT，不依赖任何第三方包，SQL 就能读。
 *
 * 语义：至少一次投递 + 主键幂等 = 效果上的恰好一次。
 *
 * 用法：
 *   npm run cdc -- --once           # 消费当前 WAL，打印并落库
 *   npm run cdc -- --watch 10       # 持续消费 10 秒
 *   npm run cdc -- --demo           # 写一条测试事件再消费
 *   npm run cdc -- --check          # 断言事件被消费且重复消费不重复计数
 */

const SLOT = process.env.CDC_SLOT ?? "kv_cdc";
const TABLE = "public.outbox_events";

async function walLevel(): Promise<string> {
  return (await q1<{ wal_level: string }>(`SHOW wal_level`))!.wal_level;
}

export async function ensureSlot(slotName: string = SLOT) {
  const existing = await q1<{ slot_name: string }>(`SELECT slot_name FROM pg_replication_slots WHERE slot_name = $1`, [slotName]);
  if (existing) return false;
  await q(`SELECT pg_create_logical_replication_slot($1, 'test_decoding')`, [slotName]);
  return true;
}

type Change = { lsn: string; xid: number; data: string };

/** 把 test_decoding 的文本行解析成 { eventId, topic } */
function parseOutbox(data: string): { eventId: number; topic: string } | null {
  if (!data.startsWith(`table ${TABLE}: INSERT:`)) return null;
  const id = data.match(/id\[bigint\]:(\d+)/)?.[1];
  const topic = data.match(/topic\[text\]:'([^']*)'/)?.[1];
  if (!id || !topic) return null;
  return { eventId: Number(id), topic };
}

export async function drain(slotName: string = SLOT, limit = 200) {
  const rows = await q<Change>(`SELECT lsn::text AS lsn, xid, data FROM pg_logical_slot_get_changes($1, NULL, $2)`, [slotName, limit]);
  let seen = 0;
  let fresh = 0;
  let lastLsn: string | null = null;
  for (const r of rows) {
    lastLsn = r.lsn;
    for (const line of r.data.split("\n")) {
      const ev = parseOutbox(line);
      if (!ev) continue;
      seen += 1;
      const ins = await q(
        `INSERT INTO cdc_consumed (event_id, topic) VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [ev.eventId, ev.topic],
      );
      if (ins.length) {
        fresh += 1;
        console.log(`  → #${ev.eventId} ${ev.topic}  ${line.slice(0, 120)}…`);
      }
    }
  }
  if (lastLsn) {
    await q(`INSERT INTO cdc_offsets (slot_name, last_lsn) VALUES ($1, $2::pg_lsn)
             ON CONFLICT (slot_name) DO UPDATE SET last_lsn = EXCLUDED.last_lsn, updated_at = now()`, [slotName, lastLsn]);
  }
  const lag = await q1<{ bytes: string }>(`
    SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS bytes
      FROM pg_replication_slots WHERE slot_name = $1`, [slotName]);
  return { rows: rows.length, seen, fresh, lag: lag?.bytes ?? "-" };
}

async function demoEvent() {
  const r = await q1<{ id: number }>(`
    INSERT INTO outbox_events (topic, aggregate_id, payload)
    VALUES ('demo.cdc', gen_random_uuid(), jsonb_build_object('at', now(), 'source', 'cdc-demo'))
    RETURNING id`);
  console.log(`写入测试事件 #${r!.id}`);
  return Number(r!.id);
}

async function main() {
  if ((await walLevel()) !== "logical") {
    console.error("wal_level 不是 logical。执行：ALTER SYSTEM SET wal_level='logical'; 然后重启 PostgreSQL。");
    process.exit(1);
  }
  const created = await ensureSlot();
  if (created) console.log(`已创建逻辑复制槽 ${SLOT}（插件 test_decoding）`);
  else console.log(`复用逻辑复制槽 ${SLOT}`);

  const argv = process.argv.slice(2);
  if (argv.includes("--demo")) {
    const id = await demoEvent();
    console.log(`消费 WAL …`);
    const r = await drain();
    console.log(`  扫描 ${r.rows} 条变更，outbox 事件 ${r.seen} 条，新建消费 ${r.fresh} 条，槽积压 ${r.lag}`);
    const got = await q1(`SELECT 1 FROM cdc_consumed WHERE event_id = $1`, [id]);
    console.log(got ? `✓ 事件 #${id} 已被消费` : `✗ 事件 #${id} 未被消费`);
    return;
  }
  if (argv.includes("--check")) {
    const id = await demoEvent();
    await drain();
    const first = await q1<{ n: number }>(`SELECT count(*)::int n FROM cdc_consumed WHERE event_id = $1`, [id]);
    const r2 = await drain(); // 再消费一次：WAL 已推进，不应产生新行
    const second = await q1<{ n: number }>(`SELECT count(*)::int n FROM cdc_consumed WHERE event_id = $1`, [id]);
    const ok = first!.n === 1 && second!.n === 1 && r2.fresh === 0;
    console.log(`${ok ? "✓" : "✗"} CDC 幂等：首轮消费=${first!.n}，重复消费后=${second!.n}，重复落库=${r2.fresh}`);
    process.exit(ok ? 0 : 1);
  }
  if (argv.includes("--watch")) {
    const seconds = Number(argv[argv.indexOf("--watch") + 1] ?? 10);
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
      const r = await drain(SLOT, 500);
      if (r.seen) console.log(`  扫描 ${r.rows}，事件 ${r.seen}，新建 ${r.fresh}，积压 ${r.lag}`);
      await new Promise((res) => setTimeout(res, 500));
    }
    return;
  }
  const r = await drain();
  console.log(`扫描 ${r.rows} 条变更，outbox 事件 ${r.seen} 条，新建消费 ${r.fresh} 条，槽积压 ${r.lag}`);
}

if (process.argv[1] && /cdc\.(ts|js)$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
