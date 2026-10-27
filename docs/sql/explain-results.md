# EXPLAIN ANALYZE 结果（自动生成）

> 由 `npm run explain` 于 2026-10-26T10:20:42.960Z 生成。数据为脚本随机生成的**模拟问答**，不代表真实用户或真实负载；数字只用于比较同一环境下不同方案，不应作为性能承诺。

- 环境：PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit
- 机器：Intel(R) Xeon(R) Processor @ 2.10GHz × 2，内存 7.8 GB（开发容器）
- 数据量：conversations 20006，messages 40012，message_concepts 20014（两名用户各约一半）
- 查询语句与应用代码相同：由 `src/server/history.ts` 的 `buildHistorySql` 生成，参数化执行。

## Q1 关键词（英文短语，≥3 字符，可用 trigram 索引）

参数：`{"keyword":"LEFT JOIN","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 141.865 ms |
| 对照：关闭位图/索引扫描 | 4267.984 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=11012.02..11012.05 rows=10 width=519) (actual time=141.783..141.792 rows=10 loops=1)
  Buffers: shared hit=11048
  ->  Sort  (cost=11012.02..11012.72 rows=280 width=519) (actual time=141.782..141.789 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 37kB
        Buffers: shared hit=11048
        ->  WindowAgg  (cost=6336.41..11005.97 rows=280 width=519) (actual time=140.649..141.462 rows=1001 loops=1)
              Buffers: shared hit=11048
              ->  Nested Loop Left Join  (cost=6336.41..11001.07 rows=280 width=479) (actual time=124.438..140.017 rows=1001 loops=1)
                    Buffers: shared hit=11048
                    ->  Nested Loop  (cost=6328.09..8664.47 rows=280 width=279) (actual time=124.410..136.396 rows=1001 loops=1)
                          Buffers: shared hit=8045
                          ->  Hash Join  (cost=6327.80..8534.38 rows=280 width=247) (actual time=124.393..133.636 rows=1001 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=5042
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10057 width=247) (actual time=0.013..7.798 rows=10006 loops=1)
                                      Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=6313.87..6313.87 rows=1115 width=16) (actual time=124.370..124.374 rows=1001 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 63kB
                                      Buffers: shared hit=3462
                                      ->  HashAggregate  (cost=6302.72..6313.87 rows=1115 width=16) (actual time=124.064..124.211 rows=1001 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 129kB
                                            Buffers: shared hit=3462
                                            ->  Append  (cost=0.00..6299.93 rows=1115 width=16) (actual time=0.012..123.634 rows=1003 loops=1)
                                                  Buffers: shared hit=3462
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=508 width=16) (actual time=0.012..54.341 rows=1001 loops=1)
                                                        Filter: ((content ~~* '%LEFT JOIN%'::text) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39011
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=505 width=16) (actual time=0.035..55.890 rows=1 loops=1)
                                                        Filter: ((content ~~* '%LEFT JOIN%'::text) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40011
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=0.29..1733.93 rows=102 width=16) (actual time=0.049..13.290 rows=1 loops=1)
                                                        Buffers: shared hit=302
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=101 width=32) (actual time=0.018..13.255 rows=1 loops=1)
                                                              Filter: ((title ~~* '%LEFT JOIN%'::text) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
                                                              Rows Removed by Filter: 20005
                                                              Buffers: shared hit=299
                                                        ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..11.23 rows=1 width=48) (actual time=0.025..0.028 rows=1 loops=1)
                                                              Index Cond: (conversation_id = cv.id)
                                                              Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Buffers: shared hit=3
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.46 rows=1 width=64) (actual time=0.002..0.002 rows=1 loops=1001)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
                                Buffers: shared hit=3003
                    ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.003..0.003 rows=1 loops=1001)
                          Buffers: shared hit=3003
                          ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.003..0.003 rows=1 loops=1001)
                                Sort Key: a.seq DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=3003
                                ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=1001)
                                      Index Cond: (reply_to_id = qm.id)
                                      Filter: (user_id = qm.user_id)
                                      Buffers: shared hit=3003
Planning:
  Buffers: shared hit=27
Planning Time: 0.958 ms
Execution Time: 141.865 ms
```
</details>

## Q2 关键词（中文四字词）

参数：`{"keyword":"条件概率","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 20.434 ms |
| 对照：关闭位图/索引扫描 | 4027.968 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=5944.09..5944.11 rows=10 width=519) (actual time=20.349..20.358 rows=10 loops=1)
  Buffers: shared hit=10279
  ->  Sort  (cost=5944.09..5944.34 rows=102 width=519) (actual time=20.348..20.356 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=10279
        ->  WindowAgg  (cost=2843.55..5941.89 rows=102 width=519) (actual time=19.306..20.058 rows=1001 loops=1)
              Buffers: shared hit=10279
              ->  Nested Loop Left Join  (cost=2843.55..5940.10 rows=102 width=479) (actual time=7.228..17.843 rows=1001 loops=1)
                    Buffers: shared hit=10279
                    ->  Nested Loop  (cost=2835.23..5088.91 rows=102 width=279) (actual time=7.214..14.949 rows=1001 loops=1)
                          Buffers: shared hit=7276
                          ->  Hash Join  (cost=2834.94..5041.52 rows=102 width=247) (actual time=7.205..12.873 rows=1001 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=4273
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10057 width=247) (actual time=0.003..4.278 rows=10006 loops=1)
                                      Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=2829.87..2829.87 rows=406 width=16) (actual time=7.195..7.199 rows=1001 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 55kB
                                      Buffers: shared hit=2693
                                      ->  HashAggregate  (cost=2825.81..2829.87 rows=406 width=16) (actual time=7.007..7.102 rows=1001 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 129kB
                                            Buffers: shared hit=2693
                                            ->  Append  (cost=34.10..2824.79 rows=406 width=16) (actual time=0.378..6.790 rows=1002 loops=1)
                                                  Buffers: shared hit=2693
                                                  ->  Bitmap Heap Scan on messages m  (cost=34.10..1390.79 rows=203 width=16) (actual time=0.377..2.813 rows=1001 loops=1)
                                                        Recheck Cond: (content ~~* '%条件概率%'::text)
                                                        Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 1000
                                                        Heap Blocks: exact=1184
                                                        Buffers: shared hit=1193
                                                        ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..34.05 rows=808 width=0) (actual time=0.244..0.244 rows=2001 loops=1)
                                                              Index Cond: (content ~~* '%条件概率%'::text)
                                                              Buffers: shared hit=9
                                                  ->  Bitmap Heap Scan on messages m_1  (cost=34.10..1390.79 rows=202 width=16) (actual time=2.889..2.890 rows=0 loops=1)
                                                        Recheck Cond: (content ~~* '%条件概率%'::text)
                                                        Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 2001
                                                        Heap Blocks: exact=1184
                                                        Buffers: shared hit=1193
                                                        ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..34.05 rows=808 width=0) (actual time=0.214..0.214 rows=2001 loops=1)
                                                              Index Cond: (content ~~* '%条件概率%'::text)
                                                              Buffers: shared hit=9
                                                  ->  Nested Loop  (cost=25.81..41.18 rows=1 width=16) (actual time=0.188..0.999 rows=1 loops=1)
                                                        Buffers: shared hit=307
                                                        ->  Bitmap Heap Scan on conversations cv  (cost=21.50..29.04 rows=1 width=32) (actual time=0.169..0.978 rows=1 loops=1)
                                                              Recheck Cond: (title ~~* '%条件概率%'::text)
                                                              Filter: (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid)
                                                              Rows Removed by Filter: 1000
                                                              Heap Blocks: exact=299
                                                              Buffers: shared hit=304
                                                              ->  Bitmap Index Scan on conversations_title_trgm_idx  (cost=0.00..21.50 rows=2 width=0) (actual time=0.138..0.138 rows=1002 loops=1)
                                                                    Index Cond: (title ~~* '%条件概率%'::text)
                                                                    Buffers: shared hit=5
                                                        ->  Bitmap Heap Scan on messages m_2  (cost=4.31..12.13 rows=1 width=48) (actual time=0.011..0.012 rows=1 loops=1)
                                                              Recheck Cond: (cv.id = conversation_id)
                                                              Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Heap Blocks: exact=1
                                                              Buffers: shared hit=3
                                                              ->  Bitmap Index Scan on messages_conv_seq_uq  (cost=0.00..4.30 rows=2 width=0) (actual time=0.008..0.008 rows=2 loops=1)
                                                                    Index Cond: (conversation_id = cv.id)
                                                                    Buffers: shared hit=2
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.46 rows=1 width=64) (actual time=0.002..0.002 rows=1 loops=1001)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
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
  Buffers: shared hit=27
Planning Time: 0.967 ms
Execution Time: 20.434 ms
```
</details>

## Q3 关键词（中文两字词，短于 trigram，需要扫描用户的消息）

参数：`{"keyword":"索引","page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 132.614 ms |
| 对照：关闭位图/索引扫描 | 8459.545 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=12199.96..12199.99 rows=10 width=519) (actual time=132.540..132.550 rows=10 loops=1)
  Buffers: shared hit=20092
  ->  Sort  (cost=12199.96..12200.73 rows=306 width=519) (actual time=132.539..132.548 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=20092
        ->  WindowAgg  (cost=7294.28..12193.35 rows=306 width=519) (actual time=131.183..132.158 rows=2000 loops=1)
              Buffers: shared hit=20092
              ->  Nested Loop Left Join  (cost=7294.28..12188.00 rows=306 width=479) (actual time=111.148..130.071 rows=2000 loops=1)
                    Buffers: shared hit=20092
                    ->  Nested Loop  (cost=7285.96..9634.43 rows=306 width=279) (actual time=111.122..124.004 rows=2000 loops=1)
                          Buffers: shared hit=14092
                          ->  Hash Join  (cost=7285.68..9492.26 rows=306 width=247) (actual time=111.110..120.079 rows=2000 loops=1)
                                Hash Cond: (qm.id = m.id)
                                Buffers: shared hit=8092
                                ->  Seq Scan on messages qm  (cost=0.00..2180.18 rows=10057 width=247) (actual time=0.003..7.272 rows=10006 loops=1)
                                      Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                      Rows Removed by Filter: 30006
                                      Buffers: shared hit=1580
                                ->  Hash  (cost=7270.48..7270.48 rows=1216 width=16) (actual time=111.093..111.098 rows=2000 loops=1)
                                      Buckets: 2048  Batches: 1  Memory Usage: 110kB
                                      Buffers: shared hit=6512
                                      ->  HashAggregate  (cost=7258.32..7270.48 rows=1216 width=16) (actual time=110.696..110.895 rows=2000 loops=1)
                                            Group Key: m.id
                                            Batches: 1  Memory Usage: 241kB
                                            Buffers: shared hit=6512
                                            ->  Append  (cost=0.00..7255.28 rows=1216 width=16) (actual time=0.058..110.086 rows=2000 loops=1)
                                                  Buffers: shared hit=6512
                                                  ->  Seq Scan on messages m  (cost=0.00..2280.21 rows=508 width=16) (actual time=0.058..48.968 rows=1000 loops=1)
                                                        Filter: ((content ~~* '%索引%'::text) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                        Rows Removed by Filter: 39012
                                                        Buffers: shared hit=1580
                                                  ->  Seq Scan on messages m_1  (cost=0.00..2280.21 rows=505 width=16) (actual time=47.076..47.076 rows=0 loops=1)
                                                        Filter: ((content ~~* '%索引%'::text) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'assistant'::text))
                                                        Rows Removed by Filter: 40012
                                                        Buffers: shared hit=1580
                                                  ->  Nested Loop  (cost=0.29..2688.78 rows=203 width=16) (actual time=0.037..13.852 rows=1000 loops=1)
                                                        Buffers: shared hit=3352
                                                        ->  Seq Scan on conversations cv  (cost=0.00..599.09 rows=202 width=32) (actual time=0.016..10.552 rows=1000 loops=1)
                                                              Filter: ((title ~~* '%索引%'::text) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
                                                              Rows Removed by Filter: 19006
                                                              Buffers: shared hit=299
                                                        ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..10.33 rows=1 width=48) (actual time=0.003..0.003 rows=1 loops=1000)
                                                              Index Cond: (conversation_id = cv.id)
                                                              Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1
                                                              Buffers: shared hit=3053
                          ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.46 rows=1 width=64) (actual time=0.002..0.002 rows=1 loops=2000)
                                Index Cond: (id = qm.conversation_id)
                                Filter: ((archived_at IS NULL) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
                                Buffers: shared hit=6000
                    ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.003..0.003 rows=1 loops=2000)
                          Buffers: shared hit=6000
                          ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=2000)
                                Sort Key: a.seq DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=6000
                                ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.002..0.002 rows=1 loops=2000)
                                      Index Cond: (reply_to_id = qm.id)
                                      Filter: (user_id = qm.user_id)
                                      Buffers: shared hit=6000
Planning:
  Buffers: shared hit=27
Planning Time: 0.774 ms
Execution Time: 132.614 ms
```
</details>

## Q4 日期范围 + 知识点

参数：`{"from":"2026-01-01","to":"2026-03-31","conceptIds":["38a2cc5f-05ef-4e19-a807-f6d5cff0d383"],"page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 0.063 ms |
| 对照：关闭位图/索引扫描 | 4.931 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=50.05..50.09 rows=2 width=519) (actual time=0.017..0.018 rows=0 loops=1)
  Buffers: shared hit=4
  ->  Incremental Sort  (cost=50.05..50.09 rows=2 width=519) (actual time=0.016..0.017 rows=0 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Presorted Key: qm.created_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
        Buffers: shared hit=4
        ->  WindowAgg  (cost=9.31..50.04 rows=1 width=519) (actual time=0.011..0.012 rows=0 loops=1)
              Buffers: shared hit=4
              ->  Nested Loop Semi Join  (cost=9.31..50.02 rows=1 width=479) (actual time=0.010..0.011 rows=0 loops=1)
                    Buffers: shared hit=4
                    ->  Nested Loop Left Join  (cost=9.02..25.09 rows=1 width=479) (actual time=0.010..0.011 rows=0 loops=1)
                          Buffers: shared hit=4
                          ->  Nested Loop  (cost=0.70..16.75 rows=1 width=279) (actual time=0.010..0.010 rows=0 loops=1)
                                Buffers: shared hit=4
                                ->  Index Scan Backward using messages_user_created_idx on messages qm  (cost=0.41..8.44 rows=1 width=247) (actual time=0.010..0.010 rows=0 loops=1)
                                      Index Cond: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (created_at >= '2026-01-01 00:00:00+08'::timestamp with time zone) AND (created_at < '2026-04-01 00:00:00+08'::timestamp with time zone))
                                      Filter: (role = 'user'::text)
                                      Buffers: shared hit=4
                                ->  Index Scan using conversations_id_user_uq on conversations c  (cost=0.29..8.31 rows=1 width=64) (never executed)
                                      Index Cond: ((id = qm.conversation_id) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
                                      Filter: (archived_at IS NULL)
                          ->  Limit  (cost=8.32..8.32 rows=1 width=220) (never executed)
                                ->  Sort  (cost=8.32..8.32 rows=1 width=220) (never executed)
                                      Sort Key: a.seq DESC
                                      ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (never executed)
                                            Index Cond: (reply_to_id = qm.id)
                                            Filter: (user_id = qm.user_id)
                    ->  Index Scan using message_concepts_pk on message_concepts mc  (cost=0.29..12.61 rows=1 width=16) (never executed)
                          Index Cond: ((message_id = ANY (ARRAY[qm.id, a.id])) AND (concept_id = ANY ('{38a2cc5f-05ef-4e19-a807-f6d5cff0d383}'::uuid[])))
                          Filter: (status <> 'rejected'::text)
Planning:
  Buffers: shared hit=12
Planning Time: 0.497 ms
Execution Time: 0.063 ms
```
</details>

## Q5 关键词 + 日期 + 知识点组合

参数：`{"keyword":"LEFT JOIN","from":"2026-01-01","to":"2026-12-31","conceptIds":["38a2cc5f-05ef-4e19-a807-f6d5cff0d383"],"page":1,"pageSize":10}`

| 方案 | Execution Time |
|---|---|
| 默认（使用索引） | 36.285 ms |
| 对照：关闭位图/索引扫描 | 4338.424 ms |

<details><summary>默认方案执行计划</summary>

```
Limit  (cost=13533.22..13533.24 rows=10 width=519) (actual time=36.110..36.119 rows=10 loops=1)
  Buffers: shared hit=14008
  ->  Sort  (cost=13533.22..13533.27 rows=23 width=519) (actual time=36.109..36.117 rows=10 loops=1)
        Sort Key: qm.created_at DESC, qm.id DESC
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=14008
        ->  WindowAgg  (cost=5137.55..13532.72 rows=23 width=519) (actual time=36.028..36.083 rows=49 loops=1)
              Buffers: shared hit=14008
              ->  Nested Loop Semi Join  (cost=5137.55..13532.32 rows=23 width=479) (actual time=12.086..35.948 rows=49 loops=1)
                    Buffers: shared hit=14008
                    ->  Nested Loop Left Join  (cost=5137.26..10001.99 rows=280 width=479) (actual time=12.074..31.498 rows=1001 loops=1)
                          Buffers: shared hit=10015
                          ->  Nested Loop  (cost=5128.94..7665.39 rows=280 width=279) (actual time=12.055..27.231 rows=1001 loops=1)
                                Buffers: shared hit=7012
                                ->  Hash Join  (cost=5128.65..7535.29 rows=280 width=247) (actual time=12.043..24.223 rows=1001 loops=1)
                                      Hash Cond: (qm.id = m.id)
                                      Buffers: shared hit=4009
                                      ->  Seq Scan on messages qm  (cost=0.00..2380.24 rows=10055 width=247) (actual time=0.006..10.513 rows=10006 loops=1)
                                            Filter: ((created_at >= '2026-01-01 00:00:00+08'::timestamp with time zone) AND (created_at < '2027-01-01 00:00:00+08'::timestamp with time zone) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                            Rows Removed by Filter: 30006
                                            Buffers: shared hit=1580
                                      ->  Hash  (cost=5114.72..5114.72 rows=1115 width=16) (actual time=12.023..12.027 rows=1001 loops=1)
                                            Buckets: 2048  Batches: 1  Memory Usage: 63kB
                                            Buffers: shared hit=2429
                                            ->  HashAggregate  (cost=5103.57..5114.72 rows=1115 width=16) (actual time=11.726..11.852 rows=1001 loops=1)
                                                  Group Key: m.id
                                                  Batches: 1  Memory Usage: 129kB
                                                  Buffers: shared hit=2429
                                                  ->  Append  (cost=104.95..5100.78 rows=1115 width=16) (actual time=0.905..11.321 rows=1003 loops=1)
                                                        Buffers: shared hit=2429
                                                        ->  Bitmap Heap Scan on messages m  (cost=104.95..1804.66 rows=508 width=16) (actual time=0.904..5.519 rows=1001 loops=1)
                                                              Recheck Cond: (content ~~* '%LEFT JOIN%'::text)
                                                              Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                              Rows Removed by Filter: 1001
                                                              Heap Blocks: exact=1027
                                                              Buffers: shared hit=1056
                                                              ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..104.83 rows=2021 width=0) (actual time=0.701..0.701 rows=2002 loops=1)
                                                                    Index Cond: (content ~~* '%LEFT JOIN%'::text)
                                                                    Buffers: shared hit=29
                                                        ->  Bitmap Heap Scan on messages m_1  (cost=104.95..1804.66 rows=505 width=16) (actual time=0.768..4.060 rows=1 loops=1)
                                                              Recheck Cond: (content ~~* '%LEFT JOIN%'::text)
                                                              Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'assistant'::text))
                                                              Rows Removed by Filter: 2001
                                                              Heap Blocks: exact=1027
                                                              Buffers: shared hit=1056
                                                              ->  Bitmap Index Scan on messages_content_trgm_idx  (cost=0.00..104.83 rows=2021 width=0) (actual time=0.622..0.622 rows=2002 loops=1)
                                                                    Index Cond: (content ~~* '%LEFT JOIN%'::text)
                                                                    Buffers: shared hit=29
                                                        ->  Nested Loop  (cost=66.23..1485.89 rows=102 width=16) (actual time=0.321..1.609 rows=1 loops=1)
                                                              Buffers: shared hit=317
                                                              ->  Bitmap Heap Scan on conversations cv  (cost=65.94..351.05 rows=101 width=32) (actual time=0.305..1.590 rows=1 loops=1)
                                                                    Recheck Cond: (title ~~* '%LEFT JOIN%'::text)
                                                                    Filter: (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid)
                                                                    Rows Removed by Filter: 1000
                                                                    Heap Blocks: exact=299
                                                                    Buffers: shared hit=314
                                                                    ->  Bitmap Index Scan on conversations_title_trgm_idx  (cost=0.00..65.91 rows=202 width=0) (actual time=0.268..0.268 rows=1002 loops=1)
                                                                          Index Cond: (title ~~* '%LEFT JOIN%'::text)
                                                                          Buffers: shared hit=15
                                                              ->  Index Scan using messages_conv_seq_uq on messages m_2  (cost=0.29..11.23 rows=1 width=48) (actual time=0.012..0.014 rows=1 loops=1)
                                                                    Index Cond: (conversation_id = cv.id)
                                                                    Filter: ((user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid) AND (role = 'user'::text))
                                                                    Rows Removed by Filter: 1
                                                                    Buffers: shared hit=3
                                ->  Index Scan using conversations_pkey on conversations c  (cost=0.29..0.46 rows=1 width=64) (actual time=0.003..0.003 rows=1 loops=1001)
                                      Index Cond: (id = qm.conversation_id)
                                      Filter: ((archived_at IS NULL) AND (user_id = '444b83ad-4352-475d-b7c5-4a57d73702eb'::uuid))
                                      Buffers: shared hit=3003
                          ->  Limit  (cost=8.32..8.32 rows=1 width=220) (actual time=0.004..0.004 rows=1 loops=1001)
                                Buffers: shared hit=3003
                                ->  Sort  (cost=8.32..8.32 rows=1 width=220) (actual time=0.003..0.003 rows=1 loops=1001)
                                      Sort Key: a.seq DESC
                                      Sort Method: quicksort  Memory: 25kB
                                      Buffers: shared hit=3003
                                      ->  Index Scan using messages_reply_idx on messages a  (cost=0.29..8.31 rows=1 width=220) (actual time=0.002..0.003 rows=1 loops=1001)
                                            Index Cond: (reply_to_id = qm.id)
                                            Filter: (user_id = qm.user_id)
                                            Buffers: shared hit=3003
                    ->  Index Scan using message_concepts_pk on message_concepts mc  (cost=0.29..12.61 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=1001)
                          Index Cond: ((message_id = ANY (ARRAY[qm.id, a.id])) AND (concept_id = ANY ('{38a2cc5f-05ef-4e19-a807-f6d5cff0d383}'::uuid[])))
                          Filter: (status <> 'rejected'::text)
                          Buffers: shared hit=3993
Planning:
  Buffers: shared hit=27
Planning Time: 1.669 ms
Execution Time: 36.285 ms
```
</details>

