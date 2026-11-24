# 函数依赖、候选键与受控冗余复核

2026-11-17。复核范围：55个逻辑表的键约束目录、核心问答/引用关系的业务FD、原文中的条件依赖与跨表派生说法。原“46 BCNF、5张2NF、4张1NF”的全库统计撤回，不用于汇报。未逐一证明全库所有业务FD，不发布新的全库范式数量。

## 1. 判定依据

候选键必须全局唯一且最小。数据库目录导出见 [candidate-keys.md](candidate-keys.md)，由 `npm run docs:keys` 生成，排除分区子表和视图。

- 只有完整、有效、键列全非空的唯一列组，才能直接作为数据库强制的全局键；再剔除包含更小唯一列组的非最小超键。INCLUDE列不参与键。
- 可空UNIQUE通常允许多个NULL；部分唯一索引只约束满足谓词的行。二者单列，不混入全局候选键。表达式唯一性须单独解释。
- 代理主键并不消除其他候选键上的部分依赖。FD须覆盖业务允许的所有状态，不能从少量样本推断。
- 非空来源子集的依赖，不直接推广至含NULL的整表；跨表可推导、可重建，也不等于本表存在非键决定因素。

## 2. 已确认的核心设计

|关系|键/业务FD|结论与取舍|
|---|---|---|
|conversations|id；id决定user_id|额外(id,user_id)唯一约束是供外键引用的超键，不是新的最小候选键|
|messages|id、(conversation_id,seq)；conversation_id→user_id|user_id对组合候选键部分依赖，不满足2NF；保留冗余用于本表权限/时间查询，以复合外键强制归属一致|
|message_concepts|(message_id,concept_id)|标签source/status依赖完整关联键，按当前已识别FD满足BCNF|
|message_terms|(term,message_id)|权重依赖完整词项关联键，按当前已识别FD满足BCNF；由同步触发器维护|
|material_versions|id、(material_id,version_no)|版本身份与版本内容分离，按当前业务FD满足BCNF|
|material_chunks|id、(version_id,ord)|位置和内容属于具体版本片段，按当前业务FD满足BCNF|
|message_citations|id、(message_id,chunk_id)|quote是每次引用的摘录，不存在chunk_id→quote；按当前已识别FD满足BCNF|
|class_stats|class_id|跨表聚合形成的受控冗余；不因“可以重算”而在关系内自动违反3NF|
|conversation_summaries|conversation_id|conversation_id决定user_id是键到属性，不构成非键传递依赖|
|audit_log|(id,at)|数据库不保证id单列跨分区唯一，不能仅凭序列通常不重复认定id是强制候选键|

`messages.user_id`只说明过滤写法和索引访问方便，少一次JOIN的收益仍需要同数据实测，不能把保留冗余本身当成已证明的性能提升。

## 3. 引用摘录结论的修正

`src/server/chat.ts`保存 `cit.quote ?? m.content.slice(0,400)`；提示词要求从片段连续摘录，因此同一chunk的不同回答可以选择不同quote。不可变片段决定的是原content，不是每次引用选择的摘录。

原“chunk_id→quote，所以引用表只有1NF”的结论撤回。测试 `tests/citation-fd.test.ts` 在同一chunk下存入两条不同回答的不同摘录，展示一个合法反例；不是修改业务库已有数据。

## 4. 暂不定级的依赖与剩余审阅

- attempts的(user_id,submit_key)包含可空列；仅submit_key非空的提交具备幂等唯一性，不是全表候选键。
- learning_evidence的作答唯一索引只覆盖attempt_id非空子集，不能用它给含笔记/阅读等其他来源的全表定级。
- notes、memories、growth_events的可空来源存在归属语义，须分别审阅非空来源和无来源记录，不机械套入整表的“source_id→user_id”。
- learning_states.stage_reason须核对所有写入路径、模板版本与历史文案，当前不假定stage永远决定同一文案。
- 部分唯一索引约束的公共/个人subject、concept命名范围，按分区业务规则解释；不从这些索引自动推导全局最高范式。
- 其他关系已有主键、外键/唯一性目录；未确认非键FD不等于已经形式化证明BCNF。

## 5. 一致性保障与后续工作

|冗余/派生|现有机制|边界|
|---|---|---|
|messages.user_id|复合外键(conversation_id,user_id)；E5检查|数据库强制，错误归属插入会失败|
|来源证据/笔记/记忆|写入路径检查；E4/E12/E13等不变量|覆盖范围不同，检查不能替代所有跨表约束|
|learning_states|结算事务重算、状态锁；E1/E9|规则变更需考虑历史重放口径|
|class_stats|增量触发器、对账视图与修复函数；E11|须同时测试并发和删除路径|
|message_terms|消息/标题同步触发器、删除级联|标题更新触发重新索引，写放大需后续测量|

后续逐步评估来源归属复合外键：先核对历史数据，再决定NULL与ON DELETE语义，并以新迁移实施。当前不为修正文档而改动0000–0031迁移或批量清理数据。

## 6. 无损分解与高阶范式边界

在简化的宽表P(user_id,concept_id,concept_name,stage)中，给定concept_id→concept_name，可分解为concepts(concept_id,concept_name)和用户状态(user_id,concept_id,stage)。交集concept_id决定concepts的全部属性，满足二元无损分解条件；上述FD保留于concepts。这是局部论证，不是对全库执行了Chase证明。

别名与先修拆表避免两个独立多值集合组合，但BCNF不蕴含4NF，没有三元表也不证明5NF。本轮不作全库4NF/5NF宣称。

## 7. 汇报讲法与复现

“我们把消息和知识点建成多对多关联；消息表保留用户归属用于检索与权限过滤，虽然形成部分依赖，但用复合外键强制与会话一致。引用表保存的是每次引用的摘录，因此不能把原片段和引用摘录视作同一个事实。”

```powershell
npm run docs:keys
npm test -- tests/history.test.ts tests/citation-fd.test.ts tests/security.test.ts
npm run verify:invariants
```

范式与FD是设计论证，测试仅验证具体反例和约束行为，不能代替对全部合法状态的数学证明。PostgreSQL约束语义参考：https://www.postgresql.org/docs/16/ddl-constraints.html 。
