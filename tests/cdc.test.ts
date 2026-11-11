/**
 * CDC（逻辑解码）集成测试
 *
 * 需要 wal_level = logical；不是 logical 时自动跳过（CI 用 postgres 服务容器时可在启动参数里开）。
 * 验证：outbox 的 INSERT 能从 WAL 解码出来、被消费一次；重复消费不重复计数。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { q, q1 } from "@/db";
import { drain, ensureSlot } from "../scripts/cdc";

const SLOT = "kv_cdc_test";
let logical = false;

describe("CDC：从 WAL 逻辑解码 outbox 事件", () => {
  beforeAll(async () => {
    const r = await q1<{ wal_level: string }>(`SHOW wal_level`);
    logical = r?.wal_level === "logical";
    if (logical) await ensureSlot(SLOT);
  });

  afterAll(async () => {
    if (!logical) return;
    await q(`SELECT pg_drop_replication_slot($1)`, [SLOT]).catch(() => {});
  });

  it("outbox 事件被解码并幂等消费", async () => {
    if (!logical) {
      console.log("wal_level 不是 logical，跳过 CDC 测试");
      return;
    }
    const ev = await q1<{ id: number }>(
      `INSERT INTO outbox_events (topic, aggregate_id, payload)
       VALUES ('test.cdc', gen_random_uuid(), '{"n":1}'::jsonb) RETURNING id`,
    );
    const first = await drain(SLOT);
    expect(first.seen).toBeGreaterThanOrEqual(1);
    expect(first.fresh).toBeGreaterThanOrEqual(1);

    const consumed = await q1<{ topic: string }>(`SELECT topic FROM cdc_consumed WHERE event_id = $1`, [ev!.id]);
    expect(consumed?.topic).toBe("test.cdc");

    const second = await drain(SLOT);
    expect(second.fresh).toBe(0);

    const offset = await q1<{ last_lsn: string }>(`SELECT last_lsn::text AS last_lsn FROM cdc_offsets WHERE slot_name = $1`, [SLOT]);
    expect(offset?.last_lsn).toBeTruthy();
  });
});
