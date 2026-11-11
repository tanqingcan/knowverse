# 索引决策记录（含一次被否决的负优化）

数据来源：`npm run explain`（20,000 组模拟问答 → 40,012 条消息、20,006 个会话、20,015 条消息标签），
同一台机器、同一份数据、同一份 SQL。完整执行计划见 `docs/sql/explain-results.md`（加索引后）与
`docs/sql/explain-results-before.md`（加索引前）。

## 1. 结论

| 查询 | 加索引前 | 加索引后 | 结论 |
|---|---|---|---|
| Q7 待重试消息（`status = 'pending'`，60/40012 行） | 5.322 ms | **0.017 ms** | ✅ 部分索引，约 300× |
| Q6 待复习知识点（`stage = 'bud'`，全表仅数十行） | 0.016 ms | 0.016 ms | ➖ 规划器仍走全表扫描，索引为数据量增长预留 |
| Q1 英文短语关键词（trigram） | 74.8 ms | 77.7 ms | ➖ 已由 GIN trgm 覆盖 |
| Q2 中文四字关键词（trigram） | 81.5 ms | 74.5 ms | ➖ 同上 |
| Q3 中文两字关键词（短于 trigram） | 88.6 ms | 75.7 ms | ➖ 仍扫描本人消息；需倒排表（C3） |
| Q4 日期 + 知识点 | 0.032 ms | 0.040 ms | ➖ 已由复合索引覆盖 |
| Q5 关键词 + 日期 + 知识点 | 19.1 ms | 20.0 ms | ➖ 同上 |

## 2. 部分索引为什么有效

```sql
CREATE INDEX messages_pending_idx ON messages (created_at) WHERE status = 'pending';
```

- 业务上 pending 只存在于“生成中/失败待重试”的极短窗口，40,012 条里只有 60 条；
- 部分索引只索引这 60 行，索引页几乎不占空间，写入代价也可以忽略；
- 查询谓词必须与索引谓词**完全一致**（`WHERE status = 'pending'`），规划器才会使用它。

对照实验：强制关闭索引扫描后 Q7 回到 7.98 ms，说明收益确实来自索引而不是缓存。

## 3. 被否决的方案：覆盖索引

曾尝试再加：

```sql
CREATE INDEX messages_user_created_cover_idx
  ON messages (user_id, created_at DESC)
  INCLUDE (conversation_id, role, status);
```

想法是“历史检索按本人 + 时间倒序，把外层需要的列带进索引，减少回表”。实测结果相反：

| 查询 | 无此索引 | 有此索引 |
|---|---|---|
| Q3 中文两字关键词 | 88.6 ms | **1412.5 ms** |
| Q1 / Q2 / Q5 | 74–82 ms | 73–82 ms（无变化） |

原因（执行计划里能看到）：两字词没有 trigram 可用，只能扫本人的全部消息；规划器发现这个索引
`(user_id, created_at)` 天然有序，于是改成 **按 created_at 顺序走索引 + 逐行回表取 content**，
`Buffers: shared hit=20888`，随机 I/O 远多于顺序扫描。索引没有包含 `content`，所以“覆盖”并不成立。

结论：**收益为零、代价明显，删除该索引**。这条实验比“多建一个索引”更适合写进报告——索引不是越多越好，
要用执行计划与实测数字判断。

## 4. 仍然存在的限制

- 中文**两字词**短于 trigram，`ILIKE '%索引%'` 无法使用 GIN trgm；当前在本人的消息范围内扫描（75 ms / 4 万条）。
  解决办法是自建二元组倒排表（C3 的 `message_terms`），而不是继续加 B 树索引。
- 所有耗时都是本机、模拟数据、单次测量的量级参考，不作为性能承诺。
