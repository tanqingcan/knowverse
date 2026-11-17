# KNOWVERSE 真实关系建模图册

[汇报主图 SVG](03-learning-model.svg) / [PNG](03-learning-model.png)：15个核心实体与15条真实外键，分域错位布局，优先用于现场讲解。主图由`scripts/build-er-story.py`生成。全库图用于覆盖核对，字段级图用于深入查阅。

元数据：55个逻辑表、106条外键、23张表启用RLS、11个用户触发器。排除分区子表与视图；不把业务关联、触发器依赖当作额外FK。

## 读图约定

- 全库图是逻辑ER（表级），不是教材Chen概念图；原教材风格概念图保留在父目录。
- 连线从子表指向父表；父端1表示此FK列均非空，0..1表示可空。子端0..N或0..1由完整唯一性约束判断。不把可空字段画成强制参与。
- 紫色线为复合FK；灰色实体为当前分域引用的外部上下文。!为NOT NULL，?为可空。
- PK为主键，UQ为唯一性；条件UQ只在部分谓词下有效，不冒充全局候选键。RLS表示数据库已启用行安全，不代表所有表都受RLS管理。
- 版本表含代理主键及父实体+版本号的自然唯一性；不因一个CASCADE外键就把表标成弱实体。
- CDC消费event_id、outbox.aggregate_id、审计row_pk可能按业务关联，但没有真实FK时不画实线。
- 1:1只说明最大基数，默认不推导父对象一定存在子对象；例如一次作答可以暂时没有评价。

## 领域与文件

|领域|实体数|字段级图|
|---|---:|---|
|身份与访问|2|[SVG](detail-identity.svg) / [PNG](detail-identity.png)|
|知识目录与学习目标|6|[SVG](detail-knowledge.svg) / [PNG](detail-knowledge.png)|
|星球与布局|6|[SVG](detail-world.svg) / [PNG](detail-world.png)|
|问答 检索与记忆|9|[SVG](detail-dialogue.svg) / [PNG](detail-dialogue.png)|
|资料版本 引用与笔记|6|[SVG](detail-materials.svg) / [PNG](detail-materials.png)|
|题目 作答与成长证据|10|[SVG](detail-practice.svg) / [PNG](detail-practice.png)|
|班级 共学与知识发布|12|[SVG](detail-collaboration.svg) / [PNG](detail-collaboration.png)|
|审计 事件与CDC|4|[SVG](detail-operations.svg) / [PNG](detail-operations.png)|

[全库55表SVG](01-full-schema.svg) · [核心跨域SVG](02-core-cross-domain.svg)

## 讲解的高级建模点

1. 消息标签、版本概念、题目考查、班级成员和卡片发布均以关联实体实现多对多，属性属于联系事实。
2. 资料/题目/学习卡的身份与不可变版本分离，引用和作答绑定具体版本；三条链复用同一版本化思想。
3. 证据与当前状态分离，撤销时间保留历史；当前学习状态是(user_id,concept_id)汇总，成长事件负责时序记录。
4. sharing_preferences、learning_intents通过复合成员FK，contributions通过复合小组成员FK，将成员资格放进数据库约束。
5. memories.corrects_id与messages.reply_to_id是自关联；concept_prerequisites是带角色的自反多对多，防环由触发器负责。
6. 图中FK不能表达所有规则：名额并发、先修防环、本命花归属、状态重放与RLS分别由约束/触发器/函数/策略承担，详见迁移与测试。

## 校验与复现

`npx tsx scripts/export-er-metadata.ts`只读更新系统目录快照；使用bundled Python运行`scripts/build-advanced-er.py`生成SVG/PNG/DOT。元数据不包含业务行或密钥。

全库覆盖校验：55表，每表恰好归属一个领域；完整图边数106与FK目录一致。完整字段、CHECK、索引谓词、触发器定义见[schema-metadata.json](schema-metadata.json)。
