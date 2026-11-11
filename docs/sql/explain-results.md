# EXPLAIN ANALYZE 结果（自动生成）

> 由 `npm run explain` 于 2026-10-27T15:02:15.241Z 生成。数据为脚本随机生成的**模拟问答**，不代表真实用户或真实负载；数字只用于比较同一环境下不同方案，不应作为性能承诺。

- 环境：PostgreSQL 16.14, compiled by Visual C++ build 1944, 64-bit
- 机器：AMD Ryzen 7 7840H with Radeon 780M Graphics     × 16，内存 27.7 GB（开发容器）
- 数据量：conversations 20006，messages 40012，message_concepts 20015（两名用户各约一半）
- 查询语句与应用代码相同：由 `src/server/history.ts` 的 `buildHistorySql` 生成，参数化执行。

## Q1 关键词（英文短语，≥3 字符，可用 trigram 索引）

参数：`{"keyword":"LEFT JOIN","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 77.699 ms |
| 对照：关闭位图/索引扫描 | 4434.400 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=10546.52..10546.54 rows=10 width=519) (actual time=77.544..77.550 rows=10 loops=1)
  Buffers: shared hit=11048
  ->  Sort  (cost=10546.52..10547.09 rows=228 width=519) (actual time=77.544..77.548 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 37kB
        Buffers: shared hit=11048
        ->  WindowAgg  (cost=6330.26..10541.59 rows=228 width=519) (actual time=76.662..77.338 rows=1001 loops=1)
              Buffers: shared hit=11048
              ->  Nested Loop Left Join  (cost=6330.26..10537.60 rows=228 width=479) (actual time=64.060..76.149 rows=1001 loops=1)
                    Buffers: shared hit=11048
                    ->  Nested Loop  (cost=6321.94..8634.94 rows=228 width=279) (actual time=64.035..73.213 rows=1001 loops=1)
                          Buffers: shared hit=8045
                          ->  Hash Join  (cost=6321.65..8528.10 rows=228 width=247) (actual time=64.019..71.232 rows=1001 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=5042
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10006 width=247) (actual time=0.009..6.273 rows=10006 loops=1)
                                      Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=6310.28..6310.28 rows=910 width=16) (actual time=63.998..64.000 rows=1001 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 55kB
                                      Buffers: shared hit=3462
                                      ->  HashAggregate  (cost=6301.18..6310.28 rows=910 width=16) (actual time=63.715..63.850 rows=1001 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 129kB
                                            Buffers: shared hit=3462
                                            ->  Append  (cost=0.00..6298.90 rows=910 width=16) (actual time=0.008..63.467 rows=1003 loops=1)
                                                  Buffers: shared hit=3462
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=404 width=16) (actual time=0.008..27.868 rows=1001 loops=1)
                                                        Filter: ((content ~~* '%LEFT JOIN%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39011
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=405 width=16) (actual time=0.024..28.950 rows=1 loops=1)
                                                        Filter: ((content ~~* '%LEFT JOIN%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40011
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=0.29..1733.93 rows=101 width=16) (actual time=0.053..6.562 rows=1 loops=1)
                                                        Buffers: shared hit=302
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=101 width=32) (actual time=0.023..6.531 rows=1 loops=1)
                                                              Filter: ((title ~~* '%LEFT JOIN%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
                                                              Rows Removed by Filter: 20005
                                                              Buffers: shared hit=299
                                                        ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..11.23 rows=1 width=48) (actual time=0.025..0.026 rows=1 loops=1)
                                                              Index Cond: (conversation_id = cv.id)
                                                              Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Buffers: shared hit=3
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.002..0.002 rows=1 loops=1001)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
                                Buffers: shared hit=3003
                    ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.003..0.003 rows=1 loops=1001)
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
  Buffers: shared hit=32
Planning Time: 1.071 ms
Execution Time: 77.699 ms
```
</details>

## Q2 关键词（中文四字词）

参数：`{"keyword":"条件概率","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 74.541 ms |
| 对照：关闭位图/索引扫描 | 4529.054 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=8741.91..8741.94 rows=10 width=519) (actual time=74.309..74.315 rows=10 loops=1)
  Buffers: shared hit=11048
  ->  Sort  (cost=8741.91..8742.29 rows=152 width=519) (actual time=74.308..74.312 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=11048
        ->  WindowAgg  (cost=5198.46..8738.63 rows=152 width=519) (actual time=73.448..74.108 rows=1001 loops=1)
              Buffers: shared hit=11048
              ->  Nested Loop Left Join  (cost=5198.46..8735.97 rows=152 width=479) (actual time=62.646..73.025 rows=1001 loops=1)
                    Buffers: shared hit=11048
                    ->  Nested Loop  (cost=5190.14..7467.53 rows=152 width=279) (actual time=62.627..70.520 rows=1001 loops=1)
                          Buffers: shared hit=8045
                          ->  Hash Join  (cost=5189.86..7396.30 rows=152 width=247) (actual time=62.610..68.909 rows=1001 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=5042
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10006 width=247) (actual time=0.008..5.429 rows=10006 loops=1)
                                      Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=5182.27..5182.27 rows=607 width=16) (actual time=62.595..62.597 rows=1001 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 55kB
                                      Buffers: shared hit=3462
                                      ->  HashAggregate  (cost=5176.20..5182.27 rows=607 width=16) (actual time=62.393..62.498 rows=1001 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 129kB
                                            Buffers: shared hit=3462
                                            ->  Append  (cost=0.00..5174.68 rows=607 width=16) (actual time=0.021..62.139 rows=1002 loops=1)
                                                  Buffers: shared hit=3462
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=303 width=16) (actual time=0.020..28.866 rows=1001 loops=1)
                                                        Filter: ((content ~~* '%条件概率%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39011
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=303 width=16) (actual time=27.951..27.951 rows=0 loops=1)
                                                        Filter: ((content ~~* '%条件概率%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40012
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=4.31..611.23 rows=1 width=16) (actual time=0.047..5.242 rows=1 loops=1)
                                                        Buffers: shared hit=302
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=1 width=32) (actual time=0.024..5.217 rows=1 loops=1)
                                                              Filter: ((title ~~* '%条件概率%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
                                                              Rows Removed by Filter: 20005
                                                              Buffers: shared hit=299
                                                        ->  Bitmap Heap Scan on messages m_2  (cost=4.31..12.13 rows=1 width=48) (actual time=0.014..0.015 rows=1 loops=1)
                                                              Recheck Cond: (cv.id = conversation_id)
                                                              Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Heap Blocks: exact=1
                                                              Buffers: shared hit=3
                                                              ->  Bitmap Index Scan on messages_conv_seq_uq  (cost=0.00..4.30 rows=2 width=0) (actual time=0.009..0.009 rows=2 loops=1)
                                                                    Index Cond: (conversation_id = cv.id)
                                                                    Buffers: shared hit=2
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=1001)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
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
  Buffers: shared hit=32
Planning Time: 0.890 ms
Execution Time: 74.541 ms
```
</details>

## Q3 关键词（中文两字词，短于 trigram，需要扫描用户的消息）

参数：`{"keyword":"索引","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 75.650 ms |
| 对照：关闭位图/索引扫描 | 8879.412 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=11721.71..11721.74 rows=10 width=519) (actual time=75.457..75.462 rows=10 loops=1)
  Buffers: shared hit=20092
  ->  Sort  (cost=11721.71..11722.34 rows=253 width=519) (actual time=75.456..75.461 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=20092
        ->  WindowAgg  (cost=7284.14..11716.24 rows=253 width=519) (actual time=73.731..75.074 rows=2000 loops=1)
              Buffers: shared hit=20092
              ->  Nested Loop Left Join  (cost=7284.14..11711.82 rows=253 width=479) (actual time=58.194..72.942 rows=2000 loops=1)
                    Buffers: shared hit=20092
                    ->  Nested Loop  (cost=7275.82..9600.53 rows=253 width=279) (actual time=58.175..68.066 rows=2000 loops=1)
                          Buffers: shared hit=14092
                          ->  Hash Join  (cost=7275.53..9481.97 rows=253 width=247) (actual time=58.167..65.003 rows=2000 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=8092
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10006 width=247) (actual time=0.010..5.682 rows=10006 loops=1)
                                      Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=7262.89..7262.89 rows=1011 width=16) (actual time=58.146..58.148 rows=2000 loops=1)
                                      Buckets: 2048 (originally 1024)  Batches: 1 (originally 1)  Memory Usage: 110kB
                                      Buffers: shared hit=6512
                                      ->  HashAggregate  (cost=7252.78..7262.89 rows=1011 width=16) (actual time=57.811..57.986 rows=2000 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 241kB
                                            Buffers: shared hit=6512
                                            ->  Append  (cost=0.00..7250.25 rows=1011 width=16) (actual time=0.032..57.324 rows=2000 loops=1)
                                                  Buffers: shared hit=6512
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=404 width=16) (actual time=0.032..25.369 rows=1000 loops=1)
                                                        Filter: ((content ~~* '%索引%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39012
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=405 width=16) (actual time=24.862..24.862 rows=0 loops=1)
                                                        Filter: ((content ~~* '%索引%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40012
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=0.29..2684.78 rows=202 width=16) (actual time=0.050..6.936 rows=1000 loops=1)
                                                        Buffers: shared hit=3352
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=202 width=32) (actual time=0.024..4.519 rows=1000 loops=1)
                                                              Filter: ((title ~~* '%索引%'::text) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
                                                              Rows Removed by Filter: 19006
                                                              Buffers: shared hit=299
                                                        ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..10.32 rows=1 width=48) (actual time=0.002..0.002 rows=1 loops=1000)
                                                              Index Cond: (conversation_id = cv.id)
                                                              Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Buffers: shared hit=3053
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=2000)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
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
  Buffers: shared hit=32
Planning Time: 0.800 ms
Execution Time: 75.650 ms
```
</details>

## Q4 日期范围 + 知识点

参数：`{"from":"2026-01-01","to":"2026-03-31","conceptIds":["9799014e-3ab3-4ab2-8777-e95c7b8dd2e8"],"page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 0.040 ms |
| 对照：关闭位图/索引扫描 | 6.338 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=50.05..50.09 rows=2 width=519) (actual time=0.011..0.012 rows=0 loops=1)
  Buffers: shared hit=4
  ->  Incremental Sort  (cost=50.05..50.09 rows=2 width=519) (actual time=0.011..0.012 rows=0 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Presorted Key: qm.created_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
        Buffers: shared hit=4
        ->  WindowAgg  (cost=9.31..50.04 rows=1 width=519) (actual time=0.009..0.009 rows=0 loops=1)
              Buffers: shared hit=4
              ->  Nested Loop Semi Join  (cost=9.31..50.02 rows=1 width=479) (actual time=0.008..0.009 rows=0 loops=1)
                    Buffers: shared hit=4
                    ->  Nested Loop Left Join  (cost=9.02..25.09 rows=1 width=479) (actual time=0.008..0.009 rows=0 loops=1)
                          Buffers: shared hit=4
                          ->  Nested Loop  (cost=0.70..16.75 rows=1 width=279) (actual time=0.008..0.008 rows=0 loops=1)
                                Buffers: shared hit=4
                                ->  Index Scan Backward using messages_user_created_idx on messages qm  (cost=0.41..8.44 rows=1 width=247) (actual time=0.008..0.008 rows=0 loops=1)
                                      Index Cond: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (created_at >= '2026-01-01 00:00:00+08'::timestamp with time zone) AND (created_at < '2026-04-01 00:00:00+08'::timestamp with time zone))
                                      Filter: (role = 'user'::text)
                                      Buffers: shared hit=4
                                ->  Index Scan using conversations_id_user_uq on conversations c  (cost=0.29..8.31 rows=1 width=64) (never executed)
                                      Index Cond: ((id = qm.conversation_id) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
                                      Filter: (archived_at IS NULL)
                          ->  Limit  (cost=8.32..8.32 rows=1 width=220) (never executed)
                                ->  Sort  (cost=8.32..8.32 rows=1 width=220) (never executed)
                                      Sort Key: a.seq DESC
                                      ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (never executed)
                                            Index Cond: (reply_to_id = qm.id)
                                            Filter: (user_id = qm.user_id)
                    ->  Index Scan using message_concepts_pk on message_concepts mc  (cost=0.29..12.61 rows=1 width=16) (never executed)
                          Index Cond: ((message_id = ANY (ARRAY[qm.id, a.id])) AND (concept_id = ANY ('{9799014e-3ab3-4ab2-8777-e95c7b8dd2e8}'::uuid[])))
                          Filter: (status <> 'rejected'::text)
Planning:
  Buffers: shared hit=14
Planning Time: 0.348 ms
Execution Time: 0.040 ms
```
</details>

## Q5 关键词 + 日期 + 知识点组合

参数：`{"keyword":"LEFT JOIN","from":"2026-01-01","to":"2026-12-31","conceptIds":["9799014e-3ab3-4ab2-8777-e95c7b8dd2e8"],"page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 20.002 ms |
| 对照：关闭位图/索引扫描 | 4611.842 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=12343.88..12343.91 rows=10 width=519) (actual time=19.752..19.759 rows=10 loops=1)
  Buffers: shared hit=14020
  ->  Sort  (cost=12343.88..12343.93 rows=20 width=519) (actual time=19.751..19.757 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=14020
        ->  WindowAgg  (cost=5061.28..12343.45 rows=20 width=519) (actual time=19.683..19.737 rows=65 loops=1)
              Buffers: shared hit=14020
              ->  Nested Loop Semi Join  (cost=5061.28..12343.10 rows=20 width=479) (actual time=5.072..19.612 rows=65 loops=1)
                    Buffers: shared hit=14020
                    ->  Nested Loop Left Join  (cost=5060.99..9468.39 rows=228 width=479) (actual time=5.060..17.167 rows=1001 loops=1)
                          Buffers: shared hit=10015
                          ->  Nested Loop  (cost=5052.67..7565.73 rows=228 width=279) (actual time=5.044..14.739 rows=1001 loops=1)
                                Buffers: shared hit=7012
                                ->  Hash Join  (cost=5052.38..7458.88 rows=228 width=247) (actual time=5.032..13.019 rows=1001 loops=1)
                                      Hash Cond: (qm.id = m.id)
                                      Buffers: shared hit=4009
                                      ->  Seq Scan on messages qm  (cost=0.00..2380.24 rows=10004 width=247) (actual time=0.006..7.125 rows=10006 loops=1)
                                            Filter: ((created_at >= '2026-01-01 00:00:00+08'::timestamp with time zone) AND (created_at < '2027-01-01 00:00:00+08'::timestamp with time zone) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                            Rows Removed by Filter: 30006
                                            Buffers: shared hit=1580
                                      ->  Hash  (cost=5041.01..5041.01 rows=910 width=16) (actual time=5.018..5.022 rows=1001 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 55kB
                                            Buffers: shared hit=2429
                                            ->  HashAggregate  (cost=5031.91..5041.01 rows=910 width=16) (actual time=4.813..4.910 rows=1001 loops=1)
                                                  Group Key: m.id
                                                  Batches: 1  Memory Usage: 129kB
                                                  Buffers: shared hit=2429
                                                  ->  Append  (cost=102.91..5029.63 rows=910 width=16) (actual time=0.553..4.653 rows=1003 loops=1)
                                                        Buffers: shared hit=2429
                                                        ->  Bitmap Heap Scan on messages m  (cost=102.91..1769.60 rows=404 width=16) (actual time=0.552..2.139 rows=1001 loops=1)
                                                              Recheck Cond: (content ~~* '%LEFT JOIN%'::text)
                                                              Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1001
                                                              Heap Blocks: exact=1027
                                                              Buffers: shared hit=1056
                                                              ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..102.81 rows=1617 width=0) (actual time=0.470..0.470 rows=2002 loops=1)
                                                                    Index Cond: (content ~~* '%LEFT JOIN%'::text)
                                                                    Buffers: shared hit=29
                                                        ->  Bitmap Heap Scan on messages m_1  (cost=102.91..1769.60 rows=405 width=16) (actual time=0.526..1.566 rows=1 loops=1)
                                                              Recheck Cond: (content ~~* '%LEFT JOIN%'::text)
                                                              Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'assistant'::text))
                                                              Rows Removed by Filter: 2001
                                                              Heap Blocks: exact=1027
                                                              Buffers: shared hit=1056
                                                              ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..102.81 rows=1617 width=0) (actual time=0.453..0.453 rows=2002 loops=1)
                                                                    Index Cond: (content ~~* '%LEFT JOIN%'::text)
                                                                    Buffers: shared hit=29
                                                        ->  Nested Loop  (cost=66.23..1485.89 rows=101 width=16) (actual time=0.203..0.886 rows=1 loops=1)
                                                              Buffers: shared hit=317
                                                              ->  Bitmap Heap Scan on conversations cv  (cost=65.94..351.05 rows=101 width=32) (actual time=0.193..0.874 rows=1 loops=1)
                                                                    Recheck Cond: (title ~~* '%LEFT JOIN%'::text)
                                                                    Filter: (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid)
                                                                    Rows Removed by Filter: 1000
                                                                    Heap Blocks: exact=299
                                                                    Buffers: shared hit=314
                                                                    ->  Bitmap Index Scan on conversations_title_trgm_idx  (cost=0.00..65.91 rows=202 width=0) (actual time=0.169..0.169 rows=1002 loops=1)
                                                                          Index Cond: (title ~~* '%LEFT JOIN%'::text)
                                                                          Buffers: shared hit=15
                                                              ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..11.23 rows=1 width=48) (actual time=0.008..0.009 rows=1 loops=1)
                                                                    Index Cond: (conversation_id = cv.id)
                                                                    Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (role = 'user'::text))
                                                                    Rows Removed by Filter: 1
                                                                    Buffers: shared hit=3
                                ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.47 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=1001)
                                      Index Cond: (id = qm.conversation_id)
                                      Filter: ((archived_at IS NULL) AND (user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid))
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
                          Index Cond: ((message_id = ANY (ARRAY[qm.id, a.id])) AND (concept_id = ANY ('{9799014e-3ab3-4ab2-8777-e95c7b8dd2e8}'::uuid[])))
                          Filter: (status <> 'rejected'::text)
                          Buffers: shared hit=4005
Planning:
  Buffers: shared hit=32
Planning Time: 0.878 ms
Execution Time: 20.002 ms
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
              Filter: ((user_id = '823b9b8a-5cde-4d18-b03f-eb4e22da894b'::uuid) AND (stage = 'bud'::text))
              Rows Removed by Filter: 10
              Buffers: shared hit=1
Planning Time: 0.052 ms
Execution Time: 0.016 ms
```
</details>

## Q7 待重试消息（部分索引：status = 'pending'）

| 方案 | Execution Time |
|---|---|
| 使用索引 | 0.017 ms |
| 强制全表扫描（对照） | 7.983 ms |

<details><summary>使用索引的执行计划</summary>

```
Limit  (cost=0.14..6.64 rows=20 width=24) (actual time=0.005..0.011 rows=20 loops=1)
  Buffers: shared hit=16
  ->  Index Scan using messages_pending_idx on messages  (cost=0.14..18.68 rows=57 width=24) (actual time=0.004..0.010 rows=20 loops=1)
        Buffers: shared hit=16
Planning Time: 0.055 ms
Execution Time: 0.017 ms
```
</details>

