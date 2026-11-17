# 五类查询基准

> 2026-11-17T03:38:33.197Z；命令：`npm run bench`。独立本机 knowverse_bench，c3-v1-40000 合成数据。每类预热 3 次、采样 30 次；P50/P95 是应用往返耗时，非性能承诺。所有者连接，不包含 RLS 开销；时间轴与班级统计复用业务表，采用精简投影，完整业务查询仍需单独测量。

- PostgreSQL：PostgreSQL 16.14, compiled by Visual C++ build 1944, 64-bit
- Node：v22.18.0；CPU：AMD Ryzen 7 7840H with Radeon 780M Graphics
- 消息 40000 条（两人各半）；时间轴事件 2000 条；班级仅 2 人，不能代表大班负载。

| 查询 | 返回行 | P50 (ms) | P95 (ms) | 执行计划摘要 |
|---|---:|---:|---:|---|
| 历史关键词 | 10 | 13.449 | 16.857 | Limit / Seq Scan / Sort / WindowAgg / Nested Loop / Aggregate / Append / Bitmap Heap Scan / Bitmap Index Scan: message_terms_pkey / Memoize / Index Scan: messages_pkey / Index Scan: conversations_pkey / Function Scan / Index Only Scan: message_terms_pkey / Subquery Scan / Hash Join / Hash / CTE Scan / Index Scan: messages_reply_idx |
| 日期范围 | 10 | 20.495 | 25.377 | Limit / Incremental Sort / WindowAgg / Nested Loop / Index Scan: messages_user_created_idx / Index Scan: conversations_pkey / Sort / Index Scan: messages_reply_idx |
| 知识点 | 10 | 589.655 | 683.181 | Limit / Incremental Sort / WindowAgg / Nested Loop / Index Scan: messages_user_created_idx / Memoize / Index Scan: conversations_pkey / Sort / Index Scan: messages_reply_idx / Materialize / Bitmap Heap Scan / Bitmap Index Scan: message_concepts_concept_idx |
| 时间轴 | 80 | 0.873 | 1.194 | Limit / Incremental Sort / Nested Loop / Index Scan: growth_events_user_created_idx / Memoize / Index Scan: concepts_pkey |
| 班级统计 | 1 | 0.263 | 0.436 | Seq Scan |

原始采样、SQL、参数和 EXPLAIN ANALYZE BUFFERS JSON 见 [bench-results.json](bench-results.json)。重复运行只替换本 fixture 的模拟用户及关联数据，保留其它数据。更多检索对照见 `npm run bench:search`（50 条词表/别名查询）。
