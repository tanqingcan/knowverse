# HASH 索引实验：什么时候用、什么时候不该加（第 7.5 节）

> 由 `npm run bench:hash` 生成；200000 行合成数据（随机 md5 作为高基数键），本机 PostgreSQL 16.14。

| 指标 | B 树 | HASH | 说明 |
|---|---|---|---|
| 等值点查 1000 次（200000 行） | 193 ms | 158 ms | 两者都走索引；差距在噪声内 |
| 索引大小 | 11.3 MB | 6.4 MB | HASH 只存哈希值，通常更小 |
| 范围查询（key > 'f'） | 走索引 | 顺序扫描 | HASH 只支持等值，范围只能全表扫 |

## 结论

1. **高基数、纯等值**：两者点查都很快，HASH 索引通常更小；但 HASH 不支持范围、排序与前缀匹配。
2. **唯一约束必须用 B 树**：`auth_sessions.token_hash` 上有 `UNIQUE` 索引，它同时承担“唯一性检查 + 等值查找”。再建 HASH 只会增加写放大，不会让查询更快。
3. 所以本项目**没有**给 `token_hash` 额外加 HASH 索引——这是测量与约束共同决定的，不是“忘了加”。
4. 什么时候该用 HASH：纯等值查找、无唯一约束、无范围需求的高基数列（例如外部系统的幂等键缓存表）。

真实表上的现状：

```sql
CREATE UNIQUE INDEX auth_sessions_token_uq ON public.auth_sessions USING btree (token_hash)
```

```bash
npm run bench:hash -- --rows 200000
```
