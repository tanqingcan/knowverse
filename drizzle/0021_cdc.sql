-- 0009：CDC 消费者状态
--
-- 用 PostgreSQL 逻辑复制（逻辑解码）把 outbox_events 的 INSERT 变成事件流：
--   · 生产端：业务事务写 outbox_events（已有）；
--   · 复制端：逻辑槽（test_decoding 插件，SQL 可读）解码 WAL；
--   · 消费端：按事件 id 幂等落库，并记录已消费的 LSN。
-- cdc_consumed 的主键保证“至少一次投递 + 幂等消费 = 效果上的恰好一次”。

CREATE TABLE cdc_consumed (
  event_id bigint PRIMARY KEY,
  topic text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cdc_offsets (
  slot_name text PRIMARY KEY,
  last_lsn pg_lsn NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cdc_consumed IS '逻辑解码消费过的事件（主键幂等，重复投递不会重复处理）';
COMMENT ON TABLE cdc_offsets IS '每个逻辑槽最近一次消费的 LSN，用于监控复制延迟';
