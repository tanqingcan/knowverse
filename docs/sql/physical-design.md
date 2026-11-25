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

## 实际业务表的存储与访问路径

2026-11-24，在隔离的 `knowverse_test` 完成迁移和种子导入后，只读查询 PostgreSQL 16.14。该实例的数据库页大小为 8192 字节。样本如下。

|关系|可见行数|主数据文件|本表索引|总占用|
|---|---:|---:|---:|---:|
|messages|18|16 KiB|104 KiB|152 KiB|
|material_chunks|32|16 KiB|64 KiB|112 KiB|
|message_citations|13|8 KiB|48 KiB|64 KiB|

主数据文件用 `pg_relation_size` 测量。总占用还包含索引、空闲空间映射、可见性映射和存在时的 TOAST。表与索引按页分配，因此小样本里的索引占用会明显大于正文；这些读数随数据、维护与索引结构变化。[PostgreSQL 对象尺寸函数](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADMIN-DBSIZE)

课件 v1 第 5 张幻灯片的文本片段在此次样本里为 225 字节，所在行版本的 `ctid` 为 `(0,11)`，对应数据库块号 0 与页内行指针号 11。教材页码用 `page_no` 表达，引用保存稳定的 `chunk_id`。数据库行版本移动时，`ctid` 可能变化。课件原文件保存在上传目录，PostgreSQL 保存文件路径、版本和提取后的文本。提取时对教材分块属于应用层；TOAST 压缩或行外存储长字段属于 PostgreSQL 存储层。[页结构](https://www.postgresql.org/docs/16/storage-page-layout.html) · [ctid](https://www.postgresql.org/docs/16/ddl-system-columns.html) · [TOAST](https://www.postgresql.org/docs/16/storage-toast.html)

```sql
SHOW block_size;

SELECT ch.ctid, v.version_no, ch.page_no, ch.ord,
       octet_length(ch.content) AS content_bytes
FROM materials AS m
JOIN material_versions AS v ON v.material_id = m.id
JOIN material_chunks AS ch ON ch.version_id = v.id
WHERE m.title = '第3章 连接查询（课件）' AND ch.page_no = 5;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('messages_user_created_idx', 'material_chunks_content_trgm_idx');
```

实测目录中，消息表有 `(user_id, created_at)` B 树，适用于指定用户后的时间范围或排序；教材正文有 `gin_trgm_ops` GIN，可为适用的模糊文本条件提供候选行。执行计划由数据量、选择性、统计与角色等共同决定。这两项查询路径可以配合 [历史查询实测](history-optimization.md) 和 [索引决策记录](index-decisions.md) 讲解。

### 月分区裁剪

现场先从目录查分区边界，再解释查询范围。本地种子库中，11 月分区的上下界是 11 月 1 日和 12 月 1 日的北京时间零点。

```sql
SELECT relname, pg_get_expr(relpartbound, oid) AS bounds
FROM pg_class
WHERE relname IN ('audit_log_2026_11', 'audit_log_2026_12');

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, at FROM audit_log
WHERE at >= TIMESTAMPTZ '2026-11-01 00:00:00+08'
  AND at <  TIMESTAMPTZ '2026-12-01 00:00:00+08';
```

该范围只访问 `audit_log_2026_11`。计划显示 `Bitmap Index Scan` 生成候选，再由 `Bitmap Heap Scan` 访问 10 个实际数据页。把日期后缀改为 `+00`，查询会跨到北京时间 12 月 1 日早上 8 点，计划因此还访问 12 月分区。当前样本中两者恰巧都返回 90 行，查询的时间范围不同。这个例子的证据是执行计划中的分区名和访问页数。Shared hit 表示从共享缓冲区找到，不能直接作为磁盘读取数。[PostgreSQL 执行计划说明](https://www.postgresql.org/docs/16/using-explain.html)
