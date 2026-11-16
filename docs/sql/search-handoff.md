# C3 数据库与基准数据交接

C3已在本机通过独立安装脚本运行。**2026-11-16：A 已把草稿正式并入 Drizzle 迁移 `0030_rag_tables.sql`，并在 `src/db/schema.ts` 登记；新克隆执行 `npm run db:migrate` 即自动建表/回填，无需再运行 `search:install`。**

## A：集成结果（已完成，0030）

- 已并入迁移：`message_terms(term,message_id,weight)`、分词函数、消息/标题同步触发器、历史数据回填。
- 已登记 schema：`src/db/schema.ts` 的 `messageTerms`；主键 `(term,message_id)`、`message_id` 索引、`term` 的 pg_trgm GIN 与迁移一致。
- **RLS 已补**：`message_terms` 启用行级安全，策略按所属 `messages.user_id = kv_current_user_id()` 判定；`kv_app` 只能看到自己消息的词项，无用户上下文时 0 行。
- 历史回填仍在迁移内执行（持有写锁），新克隆/重置时一次性完成；已有库重复执行安全。
- `npm run search:install` 保留作旧库补救/本地试验，不再是必需步骤。
- A6 的历史覆盖索引/部分索引仍未加入本次改动，性能数据不能归因于它们。


## D：共享基准数据

- 数据集定义：`scripts/search-bench-data.ts`，版本`c3-v1-40000`。40个主题、两名模拟用户、20000组问答/40000条消息；文本与时间确定性生成，UUID不保证跨次相同。
- `scripts/bench-search.ts`只使用独立本机库`knowverse_search_bench`。重跑仅删除该库内两个固定模拟账号并重建消息；不重置业务库，不读取真实学生数据。
- 目前D2的`scripts/bench.ts`尚不存在，因此本轮不能声称已与其共用。D可复用主题清单和生成SQL，后续A6/C3必须统一用同一数据集再比较。
- `docs/test-evidence/search-eval.json`保存50条查询、独立gold结果数、每次耗时、结果ID和默认EXPLAIN。测量是数据库查询往返，不含浏览器、会话鉴权、标签加载与运行时安装检查。
