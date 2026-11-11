# EXPLAIN ANALYZE 结果（自动生成）

> 由 `npm run explain` 于 2026-10-27T14:59:46.928Z 生成。数据为脚本随机生成的**模拟问答**，不代表真实用户或真实负载；数字只用于比较同一环境下不同方案，不应作为性能承诺。

- 环境：PostgreSQL 16.14, compiled by Visual C++ build 1944, 64-bit
- 机器：AMD Ryzen 7 7840H with Radeon 780M Graphics     × 16，内存 27.7 GB（开发容器）
- 数据量：conversations 20006，messages 40012，message_concepts 20015（两名用户各约一半）
- 查询语句与应用代码相同：由 `src/server/history.ts` 的 `buildHistorySql` 生成，参数化执行。

## Q1 关键词（英文短语，≥3 字符，可用 trigram 索引）

参数：`{"keyword":"LEFT JOIN","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 74.766 ms |
| 对照：关闭位图/索引扫描 | 4656.541 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=11007.27..11007.29 rows=10 width=519) (actual time=74.606..74.612 rows=10 loops=1)
  Buffers: shared hit=11048
  ->  Sort  (cost=11007.27..11007.97 rows=279 width=519) (actual time=74.606..74.611 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 37kB
        Buffers: shared hit=11048
        ->  WindowAgg  (cost=6340.35..11001.24 rows=279 width=519) (actual time=73.712..74.374 rows=1001 loops=1)
              Buffers: shared hit=11048
              ->  Nested Loop Left Join  (cost=6340.35..10996.36 rows=279 width=479) (actual time=62.449..73.272 rows=1001 loops=1)
                    Buffers: shared hit=11048
                    ->  Nested Loop  (cost=6332.03..8668.10 rows=279 width=279) (actual time=62.430..70.708 rows=1001 loops=1)
                          Buffers: shared hit=8045
                          ->  Hash Join  (cost=6331.74..8538.26 rows=279 width=247) (actual time=62.418..69.042 rows=1001 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=5042
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10033 width=247) (actual time=0.009..5.789 rows=10006 loops=1)
                                      Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=6317.83..6317.83 rows=1113 width=16) (actual time=62.400..62.403 rows=1001 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 63kB
                                      Buffers: shared hit=3462
                                      ->  HashAggregate  (cost=6306.70..6317.83 rows=1113 width=16) (actual time=62.171..62.285 rows=1001 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 129kB
                                            Buffers: shared hit=3462
                                            ->  Append  (cost=0.00..6303.92 rows=1113 width=16) (actual time=0.008..61.954 rows=1003 loops=1)
                                                  Buffers: shared hit=3462
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=507 width=16) (actual time=0.008..28.629 rows=1001 loops=1)
                                                        Filter: ((content ~~* '%LEFT JOIN%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39011
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=505 width=16) (actual time=0.030..28.702 rows=1 loops=1)
                                                        Filter: ((content ~~* '%LEFT JOIN%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40011
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=0.29..1737.93 rows=101 width=16) (actual time=0.062..4.541 rows=1 loops=1)
                                                        Buffers: shared hit=302
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=101 width=32) (actual time=0.026..4.504 rows=1 loops=1)
                                                              Filter: ((title ~~* '%LEFT JOIN%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                                              Rows Removed by Filter: 20005
                                                              Buffers: shared hit=299
                                                        ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..11.27 rows=1 width=48) (actual time=0.032..0.033 rows=1 loops=1)
                                                              Index Cond: (conversation_id = cv.id)
                                                              Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Buffers: shared hit=3
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=1001)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                Buffers: shared hit=3003
                    ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                          Buffers: shared hit=3003
                          ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                                Sort Key: a.seq DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=3003
                                ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.001..0.001 rows=1 loops=1001)
                                      Index Cond: (reply_to_id = qm.id)
                                      Filter: (user_id = qm.user_id)
                                      Buffers: shared hit=3003
Planning:
  Buffers: shared hit=27
Planning Time: 0.985 ms
Execution Time: 74.766 ms
```
</details>

## Q2 关键词（中文四字词）

参数：`{"keyword":"条件概率","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 81.517 ms |
| 对照：关闭位图/索引扫描 | 5148.316 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=11019.66..11019.68 rows=10 width=519) (actual time=81.353..81.360 rows=10 loops=1)
  Buffers: shared hit=11048
  ->  Sort  (cost=11019.66..11020.67 rows=406 width=519) (actual time=81.352..81.358 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=11048
        ->  WindowAgg  (cost=5228.85..11010.88 rows=406 width=519) (actual time=80.348..81.124 rows=1001 loops=1)
              Buffers: shared hit=11048
              ->  Nested Loop Left Join  (cost=5228.85..11003.78 rows=406 width=479) (actual time=69.053..79.926 rows=1001 loops=1)
                    Buffers: shared hit=11048
                    ->  Nested Loop  (cost=5220.53..7615.71 rows=406 width=279) (actual time=69.033..77.219 rows=1001 loops=1)
                          Buffers: shared hit=8045
                          ->  Hash Join  (cost=5220.25..7426.76 rows=406 width=247) (actual time=69.018..75.390 rows=1001 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=5042
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10033 width=247) (actual time=0.006..5.464 rows=10006 loops=1)
                                      Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=5200.00..5200.00 rows=1620 width=16) (actual time=69.005..69.008 rows=1001 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 63kB
                                      Buffers: shared hit=3462
                                      ->  HashAggregate  (cost=5183.80..5200.00 rows=1620 width=16) (actual time=68.794..68.891 rows=1001 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 129kB
                                            Buffers: shared hit=3462
                                            ->  Append  (cost=0.00..5179.75 rows=1620 width=16) (actual time=0.013..68.570 rows=1002 loops=1)
                                                  Buffers: shared hit=3462
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=811 width=16) (actual time=0.013..31.560 rows=1001 loops=1)
                                                        Filter: ((content ~~* '%条件概率%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39011
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=808 width=16) (actual time=31.716..31.716 rows=0 loops=1)
                                                        Filter: ((content ~~* '%条件概率%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40012
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=4.31..611.23 rows=1 width=16) (actual time=0.054..5.216 rows=1 loops=1)
                                                        Buffers: shared hit=302
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=1 width=32) (actual time=0.028..5.188 rows=1 loops=1)
                                                              Filter: ((title ~~* '%条件概率%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                                              Rows Removed by Filter: 20005
                                                              Buffers: shared hit=299
                                                        ->  Bitmap Heap Scan on messages m_2  (cost=4.31..12.13 rows=1 width=48) (actual time=0.017..0.018 rows=1 loops=1)
                                                              Recheck Cond: (cv.id = conversation_id)
                                                              Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Heap Blocks: exact=1
                                                              Buffers: shared hit=3
                                                              ->  Bitmap Index Scan on messages_conv_seq_uq  (cost=0.00..4.30 rows=2 width=0) (actual time=0.010..0.011 rows=2 loops=1)
                                                                    Index Cond: (conversation_id = cv.id)
                                                                    Buffers: shared hit=2
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.002..0.002 rows=1 loops=1001)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                Buffers: shared hit=3003
                    ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                          Buffers: shared hit=3003
                          ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                                Sort Key: a.seq DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=3003
                                ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                                      Index Cond: (reply_to_id = qm.id)
                                      Filter: (user_id = qm.user_id)
                                      Buffers: shared hit=3003
Planning:
  Buffers: shared hit=27
Planning Time: 0.792 ms
Execution Time: 81.517 ms
```
</details>

## Q3 关键词（中文两字词，短于 trigram，需要扫描用户的消息）

参数：`{"keyword":"索引","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 88.606 ms |
| 对照：关闭位图/索引扫描 | 8779.176 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=12643.79..12643.82 rows=10 width=519) (actual time=88.270..88.276 rows=10 loops=1)
  Buffers: shared hit=20092
  ->  Sort  (cost=12643.79..12644.68 rows=355 width=519) (actual time=88.270..88.274 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=20092
        ->  WindowAgg  (cost=7304.32..12636.12 rows=355 width=519) (actual time=86.477..87.855 rows=2000 loops=1)
              Buffers: shared hit=20092
              ->  Nested Loop Left Join  (cost=7304.32..12629.91 rows=355 width=479) (actual time=70.120..85.659 rows=2000 loops=1)
                    Buffers: shared hit=20092
                    ->  Nested Loop  (cost=7296.00..9667.43 rows=355 width=279) (actual time=70.096..80.866 rows=2000 loops=1)
                          Buffers: shared hit=14092
                          ->  Hash Join  (cost=7295.71..9502.22 rows=355 width=247) (actual time=70.081..77.812 rows=2000 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=8092
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10033 width=247) (actual time=0.012..6.641 rows=10006 loops=1)
                                      Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=7278.00..7278.00 rows=1417 width=16) (actual time=70.051..70.054 rows=2000 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 110kB
                                      Buffers: shared hit=6512
                                      ->  HashAggregate  (cost=7263.83..7278.00 rows=1417 width=16) (actual time=69.630..69.828 rows=2000 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 241kB
                                            Buffers: shared hit=6512
                                            ->  Append  (cost=0.00..7260.28 rows=1417 width=16) (actual time=0.031..69.131 rows=2000 loops=1)
                                                  Buffers: shared hit=6512
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=608 width=16) (actual time=0.031..31.848 rows=1000 loops=1)
                                                        Filter: ((content ~~* '%索引%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39012
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=606 width=16) (actual time=30.311..30.311 rows=0 loops=1)
                                                        Filter: ((content ~~* '%索引%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40012
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=0.29..2692.78 rows=203 width=16) (actual time=0.067..6.807 rows=1000 loops=1)
                                                        Buffers: shared hit=3352
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=202 width=32) (actual time=0.039..4.531 rows=1000 loops=1)
                                                              Filter: ((title ~~* '%索引%'::text) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                                              Rows Removed by Filter: 19006
                                                              Buffers: shared hit=299
                                                        ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..10.35 rows=1 width=48) (actual time=0.002..0.002 rows=1 loops=1000)
                                                              Index Cond: (conversation_id = cv.id)
                                                              Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Buffers: shared hit=3053
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=2000)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                Buffers: shared hit=6000
                    ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=2000)
                          Buffers: shared hit=6000
                          ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=2000)
                                Sort Key: a.seq DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=6000
                                ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.001..0.001 rows=1 loops=2000)
                                      Index Cond: (reply_to_id = qm.id)
                                      Filter: (user_id = qm.user_id)
                                      Buffers: shared hit=6000
Planning:
  Buffers: shared hit=27
Planning Time: 0.829 ms
Execution Time: 88.606 ms
```
</details>

## Q4 日期范围 + 知识点

参数：`{"from":"2026-01-01","to":"2026-03-31","conceptIds":["829054e5-44da-479d-8531-825e5622dcaf"],"page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 0.032 ms |
| 对照：关闭位图/索引扫描 | 5.372 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=50.05..50.09 rows=2 width=519) (actual time=0.007..0.007 rows=0 loops=1)
  Buffers: shared hit=3
  ->  Incremental Sort  (cost=50.05..50.09 rows=2 width=519) (actual time=0.006..0.007 rows=0 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Presorted Key: qm.created_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
        Buffers: shared hit=3
        ->  WindowAgg  (cost=9.31..50.04 rows=1 width=519) (actual time=0.005..0.005 rows=0 loops=1)
              Buffers: shared hit=3
              ->  Nested Loop Semi Join  (cost=9.31..50.02 rows=1 width=479) (actual time=0.004..0.005 rows=0 loops=1)
                    Buffers: shared hit=3
                    ->  Nested Loop Left Join  (cost=9.02..25.09 rows=1 width=479) (actual time=0.004..0.005 rows=0 loops=1)
                          Buffers: shared hit=3
                          ->  Nested Loop  (cost=0.70..16.75 rows=1 width=279) (actual time=0.004..0.004 rows=0 loops=1)
                                Buffers: shared hit=3
                                ->  Index Scan Backward using messages_user_created_idx on messages qm  (cost=0.41..8.44 rows=1 width=247) (actual time=0.004..0.004 rows=0 loops=1)
                                      Index Cond: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (created_at >= '2026-01-01 00:00:00+08'::timestamp with time zone) AND (created_at < '2026-04-01 00:00:00+08'::timestamp with time zone))
                                      Filter: (role = 'user'::text)
                                      Buffers: shared hit=3
                                ->  Index Scan using conversations_id_user_uq on conversations c  (cost=0.29..8.31 rows=1 width=64) (never executed)
                                      Index Cond: ((id = qm.conversation_id) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                      Filter: (archived_at IS NULL)
                          ->  Limit  (cost=8.32..8.32 rows=1 width=220) (never executed)
                                ->  Sort  (cost=8.32..8.32 rows=1 width=220) (never executed)
                                      Sort Key: a.seq DESC
                                      ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (never executed)
                                            Index Cond: (reply_to_id = qm.id)
                                            Filter: (user_id = qm.user_id)
                    ->  Index Scan using message_concepts_pk on message_concepts mc  (cost=0.29..12.61 rows=1 width=16) (never executed)
                          Index Cond: ((message_id = ANY (ARRAY[qm.id, a.id])) AND (concept_id = ANY ('{829054e5-44da-479d-8531-825e5622dcaf}'::uuid[])))
                          Filter: (status <> 'rejected'::text)
Planning:
  Buffers: shared hit=12
Planning Time: 0.309 ms
Execution Time: 0.032 ms
```
</details>

## Q5 关键词 + 日期 + 知识点组合

参数：`{"keyword":"LEFT JOIN","from":"2026-01-01","to":"2026-12-31","conceptIds":["829054e5-44da-479d-8531-825e5622dcaf"],"page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 19.084 ms |
| 对照：关闭位图/索引扫描 | 5146.822 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=13515.94..13515.97 rows=10 width=519) (actual time=18.846..18.851 rows=10 loops=1)
  Buffers: shared hit=14026
  ->  Sort  (cost=13515.94..13516.00 rows=24 width=519) (actual time=18.846..18.850 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=14026
        ->  WindowAgg  (cost=5141.49..13515.42 rows=24 width=519) (actual time=18.793..18.832 rows=49 loops=1)
              Buffers: shared hit=14026
              ->  Nested Loop Semi Join  (cost=5141.49..13515.00 rows=24 width=479) (actual time=4.601..18.746 rows=49 loops=1)
                    Buffers: shared hit=14026
                    ->  Nested Loop Left Join  (cost=5141.20..9997.27 rows=279 width=479) (actual time=4.589..16.370 rows=1001 loops=1)
                          Buffers: shared hit=10015
                          ->  Nested Loop  (cost=5132.88..7669.01 rows=279 width=279) (actual time=4.577..13.961 rows=1001 loops=1)
                                Buffers: shared hit=7012
                                ->  Hash Join  (cost=5132.59..7539.17 rows=279 width=247) (actual time=4.568..12.311 rows=1001 loops=1)
                                      Hash Cond: (qm.id = m.id)
                                      Buffers: shared hit=4009
                                      ->  Seq Scan on messages qm  (cost=0.00..2380.24 rows=10031 width=247) (actual time=0.006..6.938 rows=10006 loops=1)
                                            Filter: ((created_at >= '2026-01-01 00:00:00+08'::timestamp with time zone) AND (created_at < '2027-01-01 00:00:00+08'::timestamp with time zone) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                            Rows Removed by Filter: 30006
                                            Buffers: shared hit=1580
                                      ->  Hash  (cost=5118.68..5118.68 rows=1113 width=16) (actual time=4.554..4.556 rows=1001 loops=1)
                                            Buckets: 2048  Batches: 1  Memory Usage: 63kB
                                            Buffers: shared hit=2429
                                            ->  HashAggregate  (cost=5107.55..5118.68 rows=1113 width=16) (actual time=4.399..4.467 rows=1001 loops=1)
                                                  Group Key: m.id
                                                  Batches: 1  Memory Usage: 129kB
                                                  Buffers: shared hit=2429
                                                  ->  Append  (cost=104.95..5104.77 rows=1113 width=16) (actual time=0.525..4.274 rows=1003 loops=1)
                                                        Buffers: shared hit=2429
                                                        ->  Bitmap Heap Scan on messages m  (cost=104.95..1804.66 rows=507 width=16) (actual time=0.525..2.008 rows=1001 loops=1)
                                                              Recheck Cond: (content ~~* '%LEFT JOIN%'::text)
                                                              Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1001
                                                              Heap Blocks: exact=1027
                                                              Buffers: shared hit=1056
                                                              ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..104.83 rows=2021 width=0) (actual time=0.437..0.437 rows=2002 loops=1)
                                                                    Index Cond: (content ~~* '%LEFT JOIN%'::text)
                                                                    Buffers: shared hit=29
                                                        ->  Bitmap Heap Scan on messages m_1  (cost=104.95..1804.66 rows=505 width=16) (actual time=0.489..1.453 rows=1 loops=1)
                                                              Recheck Cond: (content ~~* '%LEFT JOIN%'::text)
                                                              Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'assistant'::text))
                                                              Rows Removed by Filter: 2001
                                                              Heap Blocks: exact=1027
                                                              Buffers: shared hit=1056
                                                              ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..104.83 rows=2021 width=0) (actual time=0.416..0.416 rows=2002 loops=1)
                                                                    Index Cond: (content ~~* '%LEFT JOIN%'::text)
                                                                    Buffers: shared hit=29
                                                        ->  Nested Loop  (cost=66.23..1489.89 rows=101 width=16) (actual time=0.198..0.754 rows=1 loops=1)
                                                              Buffers: shared hit=317
                                                              ->  Bitmap Heap Scan on conversations cv  (cost=65.94..351.05 rows=101 width=32) (actual time=0.190..0.745 rows=1 loops=1)
                                                                    Recheck Cond: (title ~~* '%LEFT JOIN%'::text)
                                                                    Filter: (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid)
                                                                    Rows Removed by Filter: 1000
                                                                    Heap Blocks: exact=299
                                                                    Buffers: shared hit=314
                                                                    ->  Bitmap Index Scan on conversations_title_trgm_idx  (cost=0.00..65.91 rows=202 width=0) (actual time=0.167..0.167 rows=1002 loops=1)
                                                                          Index Cond: (title ~~* '%LEFT JOIN%'::text)
                                                                          Buffers: shared hit=15
                                                              ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..11.27 rows=1 width=48) (actual time=0.007..0.008 rows=1 loops=1)
                                                                    Index Cond: (conversation_id = cv.id)
                                                                    Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (role = 'user'::text))
                                                                    Rows Removed by Filter: 1
                                                                    Buffers: shared hit=3
                                ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=1001)
                                      Index Cond: (id = qm.conversation_id)
                                      Filter: ((archived_at IS NULL) AND (user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid))
                                      Buffers: shared hit=3003
                          ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                                Buffers: shared hit=3003
                                ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                                      Sort Key: a.seq DESC
                                      Sort Method: quicksort  Memory: 25kB
                                      Buffers: shared hit=3003
                                      ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.001..0.001 rows=1 loops=1001)
                                            Index Cond: (reply_to_id = qm.id)
                                            Filter: (user_id = qm.user_id)
                                            Buffers: shared hit=3003
                    ->  Index Scan using message_concepts_pk on message_concepts mc  (cost=0.29..12.61 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1001)
                          Index Cond: ((message_id = ANY (ARRAY[qm.id, a.id])) AND (concept_id = ANY ('{829054e5-44da-479d-8531-825e5622dcaf}'::uuid[])))
                          Filter: (status <> 'rejected'::text)
                          Buffers: shared hit=4011
Planning:
  Buffers: shared hit=27
Planning Time: 0.868 ms
Execution Time: 19.084 ms
```
</details>

## Q6 待复习知识点（部分索引：stage = 'bud'）

| 方案 | Execution Time |
|---|---|
| 使用索引 | 0.016 ms |
| 强制全表扫描（对照） | 0.016 ms |

<details><summary>使用索引的执行计划</summary>

```
Limit  (cost=1.21..1.21 rows=2 width=24) (actual time=0.010..0.011 rows=3 loops=1)
  Buffers: shared hit=1
  ->  Sort  (cost=1.21..1.21 rows=2 width=24) (actual time=0.010..0.010 rows=3 loops=1)
        Sort Key: review_due_at
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=1
        ->  Seq Scan on learning_states  (cost=0.00..1.20 rows=2 width=24) (actual time=0.006..0.007 rows=3 loops=1)
              Filter: ((user_id = '04fa9b85-9f8b-4f96-9dfd-c9dc7575cd26'::uuid) AND (stage = 'bud'::text))
              Rows Removed by Filter: 10
              Buffers: shared hit=1
Planning Time: 0.042 ms
Execution Time: 0.016 ms
```
</details>

## Q7 待重试消息（部分索引：status = 'pending'）

| 方案 | Execution Time |
|---|---|
| 使用索引 | 5.322 ms |
| 强制全表扫描（对照） | 5.508 ms |

<details><summary>使用索引的执行计划</summary>

```
Limit  (cost=2085.72..2085.77 rows=20 width=24) (actual time=5.310..5.312 rows=20 loops=1)
  Buffers: shared hit=1584
  ->  Sort  (cost=2085.72..2085.87 rows=59 width=24) (actual time=5.310..5.311 rows=20 loops=1)
        Sort Key: created_at
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=1584
        ->  Seq Scan on messages  (cost=0.00..2084.15 rows=59 width=24) (actual time=5.287..5.300 rows=60 loops=1)
              Filter: (status = 'pending'::text)
              Rows Removed by Filter: 39952
              Buffers: shared hit=1584
Planning Time: 0.070 ms
Execution Time: 5.322 ms
```
</details>

