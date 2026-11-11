# 物理设计实验：B+ 树、HASH 与聚簇（第 7.5 节）

> 由 `npm run bench:physical` 生成；100000 行合成数据，本机 PostgreSQL 16.14。仅比较量级。

| 步骤 | 耗时 | shared hit | 说明 |
|---|---|---|---|
| 范围查询（无索引） | 9 ms | 1924 | 顺序扫描 |
| 范围查询（B 树索引） | 0 ms | 21 | 走索引 |
| 范围查询（聚簇后） | 1 ms | 2 | 走索引 |
| 等值查询（单列 B 树） | 0 ms | 5 | 走索引 |
| 等值查询（HASH） | 1 ms | 8 | 走索引 |

| 对象 | 大小 |
|---|---|
| 堆表（聚簇前） | 15.0 MB |
| 堆表（聚簇后） | 15.0 MB |
| 单列 B 树索引 (user_id) | 688 KB |
| HASH 索引 (user_id) | 4360 KB |

## 结论

1. **B 树适合范围 + 排序**：`(user_id, at)` 让“某人某段时间”的查询走索引；HASH 只能等值，不能范围与前缀。
2. **低基数列上 B 树可能反而更小**：本次 100k 行只有 500 个不同 user_id，B 树做了重复键去重（PostgreSQL 13+ 的 deduplication），索引只有几百 KB；HASH 索引不压缩重复键，反而更大。等值查询两者耗时相当。**结论：选 HASH 之前要看基数并实测**，不能背结论。
3. **聚簇的收益是减少随机 I/O**：按 `(user_id, at)` 物理重排后，同一条范围查询的 shared hit 从 21 降到 2；代价是 `CLUSTER` 持 `ACCESS EXCLUSIVE` 并重写整表，只能在维护窗口做（我们的 `kv_nightly_maintenance` 只做 ANALYZE，不自动 CLUSTER）。
4. 这些结论与 `docs/sql/index-decisions.md` 一致：索引/聚簇都要用执行计划与实测数字决定，而不是“看起来更快”。

```bash
npm run bench:physical -- --rows 100000
```
