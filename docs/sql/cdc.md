# CDC：用逻辑解码把 outbox 变成事件流

## 1. 为什么

项目里已经有事务性 outbox（业务事务内写 `outbox_events`），但没有消费者：不变量检查 `W1` 一直报「未投递事件堆积」。
常见的两种投递方式是**轮询 outbox 表**和**让数据库把变更推出来**。后者就是逻辑解码（logical decoding）。

## 2. 原理（三句话）

1. PostgreSQL 把所有变更写进 WAL；
2. 一个**逻辑复制槽**可以让服务端把 WAL 解码成行级变更，并记住「已经消费到哪儿」（`confirmed_flush_lsn`）；
3. 消费端读变更、按事件 id 幂等落库，然后确认 LSN——**至少一次投递 + 幂等 = 效果上的恰好一次**。

## 3. 本项目的实现

```bash
npm run cdc -- --demo          # 写一条测试事件，从 WAL 解码并消费
npm run cdc -- --once          # 消费当前 WAL
npm run cdc -- --watch 10      # 持续消费 10 秒
npm run cdc -- --check         # 断言“消费一次、重复消费不重复计数”
```

- 插件用 `test_decoding`（输出是文本，SQL 就能读，不需要第三方库）；
- 消费表 `cdc_consumed(event_id PRIMARY KEY)` 保证幂等；
- 位点表 `cdc_offsets(slot_name, last_lsn)` 记录消费进度；
- 每轮打印槽积压（`pg_wal_lsn_diff(now, confirmed_flush_lsn)`），积压过大说明消费者落后，WAL 会被保留占盘。

实测输出：

```
已创建逻辑复制槽 kv_cdc（插件 test_decoding）
写入测试事件 #31
  → #31 demo.cdc  table public.outbox_events: INSERT: id[bigint]:31 topic[text]:'demo.cdc' …
扫描 3 条变更，outbox 事件 1 条，新建消费 1 条，槽积压 744 bytes
✓ 事件 #31 已被消费
```

## 4. 前置条件与代价

- `wal_level = logical`（本机已执行 `ALTER SYSTEM SET wal_level='logical'` 并重启；Docker 环境在 `command` 里加 `-c wal_level=logical`）；
- 复制槽会**保留 WAL**：消费者长期掉线会撑爆磁盘，必须监控积压；
- `test_decoding` 适合演示与调试；生产应使用 `pgoutput` + publication，只订阅需要的表（`CREATE PUBLICATION kv_outbox FOR TABLE outbox_events`），并做二进制解析。

## 5. 测试

`tests/cdc.test.ts`：插入 outbox 事件 → 解码消费 → 断言 `cdc_consumed` 有记录、位点已推进；第二次消费 `fresh = 0`。
环境不是 `wal_level=logical` 时自动跳过，不会让 CI 无故失败。
