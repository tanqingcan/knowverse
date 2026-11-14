# C3 数据库与基准数据交接

C3已在本机通过独立安装脚本运行，但尚未合并到A负责的Drizzle迁移和schema定义。没有宣称A1/A6或D2已完成。

## A：待集成

- 草案：`docs/sql/drafts/message-terms.sql`，新增`message_terms(term,message_id,weight)`、分词函数、消息/标题同步触发器和历史数据回填。SQL在事务内执行，可重复运行。
- 词项主键`(term,message_id)`本身是B-tree；另有`message_id`索引用于编辑/删除维护，`term`的pg_trgm GIN用于后续相似词实验（当前精确词项查询主要使用B-tree）。
- 在`src/db/schema.ts`登记同样的表与约束，并按当时最新的迁移编号纳入`drizzle/`和journal；不要复制一个已存在的编号。
- 与A1的RLS、应用角色权限一起审查。草案为普通invoker函数，不使用SECURITY DEFINER；新增表目前没有宣称已受RLS保护。应用候选查询始终关联messages并限制user_id，但不能替代数据库权限策略。
- A6的历史覆盖索引/部分索引尚未加入本次改动，性能数据不能归因于它们。
- 本机命令`npm run search:install`应用草案并回填。服务检测新表存在时启用倒排，否则自动回退原检索；新克隆在A集成前仍可运行原检索。
- 大规模回填会持有锁并产生写入开销，应在维护窗口执行。本轮在4万条模拟消息验证，不承诺大规模无停顿迁移。

## D：共享基准数据

- 数据集定义：`scripts/search-bench-data.ts`，版本`c3-v1-40000`。40个主题、两名模拟用户、20000组问答/40000条消息；文本与时间确定性生成，UUID不保证跨次相同。
- `scripts/bench-search.ts`只使用独立本机库`knowverse_search_bench`。重跑仅删除该库内两个固定模拟账号并重建消息；不重置业务库，不读取真实学生数据。
- 目前D2的`scripts/bench.ts`尚不存在，因此本轮不能声称已与其共用。D可复用主题清单和生成SQL，后续A6/C3必须统一用同一数据集再比较。
- `docs/test-evidence/search-eval.json`保存50条查询、独立gold结果数、每次耗时、结果ID和默认EXPLAIN。测量是数据库查询往返，不含浏览器、会话鉴权、标签加载与运行时安装检查。
