# 数据库专项实施记录

2026-11-17。保留原五类查询基准，不用不同数据分布间的数字计算提升。

## 已落盘

- history.ts在知识点条件存在时使用候选问答集合；问题与最新回答标签都可命中，旧回答标签排除，集合去重。关键词相关度、时区日期、学科、分页与用户过滤保留。
- buildHistorySql第五参数仅供同口径对照关闭本次优化；原第四参数仍控制倒排/legacy，保持已有调用兼容。
- 新增查询语义综合测试、引用摘录FD合法反例。候选键目录不再把可空UNIQUE、部分唯一性、包含主键的超键混入全局候选键。
- 复核核心FD，撤回全库46/5/4数量及全库4NF/5NF宣称；未证明的关系明确标记，不编造全库证明。
- 新增bench:history；仅在本机knowverse_bench使用原4万消息并加冷热标签。角色无SUPERUSER/BYPASSRLS，无上下文0行，两名用户各自看不到其他人的消息。

## 测量

初稿只先筛候选、末尾仍重复EXISTS时，热门owner出现约2.5秒回退，因此未交付该版本。最终把最新回答校验移入候选层，移除重复扫描。先前成功验证轮次保留于 ../test-evidence/history-optimization-validation-run.json；最终测量在全量测试和build结束后单独执行。

|知识点|角色|并发|原查询P95 ms|改写P95 ms|
|---|---|---:|---:|---:|
|冷门|kv_app|1|78.74|4.66|
|冷门|kv_app|4|142.15|5.15|
|热门|kv_app|1|144.00|134.32|
|热门|kv_app|4|273.33|103.82|

原始采样、吞吐和16组计划见 [JSON](history-optimization.json)，全表见 [结果](history-optimization.md)。20请求/组、预热2次、固定原查询后改写顺序；缓存与系统负载仍会影响结果。闭环并发1/4不代表线上容量，不含HTTP、浏览器和真实模型。

## 验证与边界

最终250例/37文件通过，typecheck和生产build通过；原始结果 ../test-evidence/vitest-history-2026-11-17.json。本轮无新迁移/索引，未reset业务库，未调用付费模型。新反例测试只写独立测试库。

下周可用 ../database-progress-briefing.md 的5页提纲。后续继续扩大规模/数据偏斜、测HTTP/连接池、审阅可空来源FD与来源归属约束、安排outbox消费和备份恢复。既有outbox积压没有在本轮人为清空。代码尚未提交/推送，远程CI未运行。

官方依据：[EXPLAIN](https://www.postgresql.org/docs/16/using-explain.html)、[唯一性与NULL](https://www.postgresql.org/docs/16/ddl-constraints.html)、[RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)。
