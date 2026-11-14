# 在线 DDL 实测

> 由 `npm run lab:online-ddl` 于 2026-10-27T15:46:04.274Z 生成。表：lab_online.orders，50000 行；全程有并发写入客户端。

| 操作 | 耗时 | 说明 |
|---|---|---|
| 普通 CREATE INDEX（另一个长事务持锁时） | — | 被拒绝 55P03：canceling statement due to lock timeout（lock_timeout = 200ms） |
| CREATE INDEX CONCURRENTLY | 32 ms | 并发写入 74 次，最大延迟 2 ms |
| 加列 + 分批回填 | 575 ms | 26 批，单批最长 16 ms，并发写入最大延迟 2 → 12 ms |
| ADD CONSTRAINT NOT VALID + VALIDATE | 6 ms | 加约束 1 ms（仅元数据），校验 6 ms（SHARE UPDATE EXCLUSIVE，不阻塞写入） |

## 结论

1. **普通 `CREATE INDEX`** 持 `SHARE` 锁，期间写入被阻塞；设置 `lock_timeout` 后直接被拒绝（`55P03`）——这就是线上不能在业务高峰直接建索引的原因。
2. **`CREATE INDEX CONCURRENTLY`** 分两阶段扫描并等待旧事务结束，不阻塞写入；代价是更慢、且不能在事务块里执行、失败会留下 `INVALID` 索引需要重建。
3. **加列** 在 PG 11+ 是纯元数据操作（默认值不重写表）；**回填**要分批 + `lock_timeout` + `SKIP LOCKED`，可中断、可续跑。
4. **加约束** 用 `NOT VALID` 先拿元数据锁（毫秒级），再用 `VALIDATE CONSTRAINT` 以弱锁校验历史行，避免长时间 `ACCESS EXCLUSIVE`。

## 一致性核对

- 行数 50000，已回填 50000，未回填 0
- 新建索引：lab_online.orders_updated_idx

```bash
npm run lab:online-ddl -- --rows 50000
```
