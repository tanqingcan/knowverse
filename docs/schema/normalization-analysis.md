# 函数依赖、候选键与受控冗余复核

2026-11-17。复核范围：55个逻辑表的键约束目录、核心问答/引用关系的业务FD、原文中的条件依赖与跨表派生说法。原“46 BCNF、5张2NF、4张1NF”的全库统计撤回，不用于汇报。未逐一证明全库所有业务FD，不发布新的全库范式数量。

迁移 0032 新增两张关联表，当前候选键目录共 57 张逻辑表。片段标签以 (chunk_id, concept_id) 决定该联系的来源和审核状态。片段向量以 (chunk_id, model_key) 决定编码结果和索引时间，模型切换可为同一片段存放另一条记录。[新增关系与检索实现](../retrieval.md)

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

## 8. 从一次课后提问读懂关系模式

课件第 4 页讲了 ON 和 WHERE。一位同学就此提问。老师如果问“你们怎么知道系统引用的是哪一页”，可以沿着这张表讲。每行只列涉及本例的实际列。

|一行表示什么|关系模式节选|如何找到下一行|
|---|---|---|
|一份课件|materials(id, title, subject_id)|同一份课件可以反复上传|
|它的一次上传|material_versions(id, material_id, version_no, sha256, storage_path, status)|用 material_id 找课件，用 (material_id, version_no) 区分修订|
|这次上传中的一段原文|material_chunks(id, version_id, ord, page_no, content)|同一页可能有正文和备注，片段由 (version_id, ord) 唯一标识|
|会话中的一次发言|messages(id, conversation_id, seq, user_id, role, content)|问题和回答各占一行，seq 是会话内序号|
|某条回答引用某个片段一次|message_citations(message_id, chunk_id, quote, ref_label)|同一片段可被多条回答引用；同一回答可引用多个片段|
|某条消息被标注某个知识点|message_concepts(message_id, concept_id, source, status)|在问答流程里候选标签挂在学生的问题上，引用挂在助手的回答上|

绑定片段的好处可以现场验证。发布课件 v2 之后，旧回答里的 chunk_id 仍指向 v1，通过 version_id 仍能找到当时的页码与原文。查询时把“哪次上传”“哪一段”“哪次引用”连回去即可。

```sql
SELECT m.title, v.version_no, ch.page_no, ch.ord, ci.ref_label, ci.quote
FROM message_citations AS ci
JOIN material_chunks AS ch ON ch.id = ci.chunk_id
JOIN material_versions AS v ON v.id = ch.version_id
JOIN materials AS m ON m.id = v.material_id
WHERE ci.message_id = $1
ORDER BY ci.ord;
```

`$1` 绑定回答的消息 ID。即使两个版本都有“第 4 页”，查询也只经过被引用片段所属的版本。课件页码是显示位置，数据库用片段 ID 定位。

### 怎么判断保留多少冗余

函数依赖 X → Y 的意思是，在业务允许的数据里，两行只要 X 相同，Y 就必须相同。候选键是能决定整行的最小属性组。分析时要同时看代理 ID 和业务键。

* **消息归属展示部分依赖。** (conversation_id, seq) 决定具体消息；其中 conversation_id 单独就决定 user_id。用户归属是非主属性，因此这张表没有达到 2NF。把 user_id 移到会话可以消除重复，但每次按用户筛消息、判断行权限就需要再查会话。项目保留它，并以 (conversation_id, user_id) 复合外键阻止归属冲突。查询方便性和数据库约束都能在代码中检验，性能收益须另做对照实验。
* **知识点名称展示 2NF 和 3NF 的差别。** 取真实表的投影 concepts(id, name, name_norm)。不同学科允许同名，所以这三个属性中只有 id 能唯一确定一行。按种子和应用写入规则，name → name_norm，例如 `LEFT JOIN` 规范化为 `leftjoin`。这个投影的单列候选键没有部分依赖，达到 2NF；规范化名称又传递依赖 id，未达到 3NF。保留两列就能展示原名，并用统一写法查重。该 FD 来自应用函数，数据库没有 CHECK 强制两列一致。这是投影的结论，全表还有归属范围和条件唯一索引。
* **知识点别名展示 3NF 和 BCNF 的差别。** 取 concept_aliases 的四列 (id, concept_id, alias, alias_norm)。数据库强制 id 和 (concept_id, alias_norm) 唯一。在 alias → alias_norm 的写入规则下，(concept_id, alias) 也能决定整行。一个别名可在不同知识点中出现，因此 alias 不是超键。alias_norm 属于候选键，是主属性；在上述依赖集下，该投影满足 3NF，却因 alias → alias_norm 未达到 BCNF。把所有“原别名 → 规范名”另建字典可以消去这项依赖，但会为很小的映射多引入一张表和一次连接。
* **引用展示适合分解的地方。** 片段决定其完整正文；用户在每次回答中采用哪句摘录，由该次引用决定。把完整正文留在片段表，把摘录留在引用表，同一段课件就能支持两条不同的回答。按已识别的业务 FD，这张引用表满足 BCNF。

数据库系统概论作业要求综合评价规范化和开发方便性。当前设计中，版本溯源、名称展示与归属校验各有具体需求，已经足以讨论不同范式。现有概念图选取了跨资料、问答、练习的实体和联系，可配合上述关系模式逐层展开。[核心 Chen ER 图](../er/advanced/03-learning-model.svg)
