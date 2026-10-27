# 大模型辅助数据库设计记录

> 状态：**自动生成的草案，待团队审阅**。本记录只描述实际发生的过程，不包含任何同学讨论、人工评价或历史交互；“团队审阅意见”一栏留给团队填写。

## 1. 过程说明

| 项 | 内容 |
|---|---|
| 时间 | 2026-10-26（本仓库首次实现时） |
| 参与者 | 一名团队成员提出需求与候选表清单；大模型（Claude，作为编码助手）完成审查、修改与实现 |
| 输入 | ① 课程附件《大作业描述 261020.pptx》；② 团队成员在任务说明中给出的候选表清单（见 §2）与约束（多对多用关联表、不拼接 ID、核心关系不放 JSON、版本与引用绑定、状态可追溯等） |
| 审查方法 | 逐个实体检查边界；写出主要函数依赖与候选键；对照真实查询（历史检索、档案、待复习、先修）确认索引；用测试验证约束（幂等、回滚、并发、隔离） |
| 输出 | `src/db/schema.ts`（Drizzle 定义）→ `drizzle-kit generate` 生成 `drizzle/0000_init.sql`；手写 `drizzle/0001_constraints_triggers.sql` |

说明：任务说明中的候选清单本身是否由大模型产生，本记录无法确认，因此称为“初始候选”。以下“修改理由”是大模型给出的分析，**其合理性需要团队判断**。

## 2. 初始候选（来自任务说明）

基础：users、sessions、planets、gardens、plants、subjects、concepts、concept_aliases、learning_goals、goal_concepts、conversations、messages、message_concepts、materials、material_versions、material_chunks、message_citations。
训练与成长：task_versions、attempts、hint_events、evaluations、learning_evidence、learning_states、state_history、growth_events。
增强：knowledge_cards、card_versions、classes、class_members、sharing_preferences、learning_intents、study_groups、study_group_members、contributions、outbox_events。

## 3. 审查与修改

| # | 初始建议 | 审查发现（规则 / 依据） | 修改结果 | 修改理由 |
|---|---|---|---|---|
| 1 | `sessions` | 名称与“学习会话 / 对话会话”易混淆 | 更名 `auth_sessions`，只存 token 的 SHA-256 | 语义清楚；数据库泄露时不暴露可用令牌 |
| 2 | 只有 `task_versions` | 作答引用版本，但“题目身份、题型、所属学科、考查的知识点”不随版本变化；若都放在版本里，每个版本重复存储 → 部分依赖 | 拆出 `tasks`（身份）+ `task_versions`（不可变内容）+ `task_concepts`（多对多）+ `task_hints`（提示，供 hint_events 外键引用） | task_versions 的候选键是 (task_id, version_no)，题型等只依赖 task_id |
| 3 | `state_history` 与 `growth_events` 并列 | 二者都是按时间追加的事件流，主要读法相同（按用户、知识点、时间）；拆开需要 UNION | 合并为 `growth_events`，用 `event_type` 区分阶段变化与其它可见事件 | 避免为了表数而拆表；阶段历史仍可完整追溯（from_stage、to_stage、evidence_id、reason） |
| 4 | messages 中有 user_id 吗？ | 未说明。权限过滤需要它，但它传递依赖于 conversation_id | 保留 user_id，并加复合外键 `(conversation_id, user_id) → conversations(id, user_id)` | 受控冗余：检索性能与权限写法更简单；数据库保证一致（见 database-design §4.2） |
| 5 | message_citations 引用什么？ | 若引用 material 或 version，无法定位页码段落；若再冗余 page_no，会产生传递依赖 | 只引用 `chunk_id`（片段属于不可变版本），另存 quote 快照 | 引用自然绑定版本与位置；新版本不改写旧引用（有测试） |
| 6 | 缺少模型调用元数据 | 需求要求保存“必要的模型调用元数据”、区分演示与真实模式 | 新增 `model_calls`（模式、模型、状态、耗时、令牌数、错误码、工具轨迹 jsonb） | 轨迹是日志，不参与关系查询，适合 jsonb |
| 7 | AI 提出的新概念存哪里？ | 需求：AI 只提出候选，不随意合并或新建 | 新增 `concept_suggestions`，用户接受后才建立个人知识点 | 把“建议”与“事实”分开 |
| 8 | 缺少先修关系 | “先修条件已满足的任务”“递归 CTE 检测循环”都需要 | 新增 `concept_prerequisites`（自反多对多），CHECK 禁止自指，触发器用递归 CTE 防环 | 环在应用层很难可靠防止，放在数据库 |
| 9 | 资料提取出的候选概念 | RAG 流程要求“候选概念确认” | 新增 `material_concepts`（版本—知识点，含确认状态与命中次数） | 绑定到版本而非资料，旧版本的确认结果不被覆盖 |
| 10 | 笔记没有独立实体 | 嫩芽阶段的证据之一是笔记；笔记需要可编辑与归档 | 新增 `notes`，证据通过 note_id 引用 | 证据只记录“发生了什么”，笔记内容单独维护 |
| 11 | 学习卡来源与发布 | 卡片应能回到原问答；发布需要版本与撤回 | 新增 `card_sources`（卡片版本—消息）与 `card_publications`（卡片版本—班级，含撤下时间） | 多对多使用关联表 |
| 12 | 本命花如何表示？ | 在 plants 上加 is_natal 布尔列需要“每颗星球最多一个 true”的跨表约束 | `planets.natal_plant_id → plants`（DEFERRABLE）+ 延迟约束触发器检查归属 | 单值属性放在它真正属于的实体上；环形引用用可延迟外键解决 |
| 13 | 成员资格类约束 | 意愿、分享设置、贡献只应属于成员 | `learning_intents`、`sharing_preferences` 复合外键到 `class_members`；`contributions` 复合外键到 `study_group_members` | 约束由数据库保证 |
| 14 | 共学名额 | 只在应用中先查后插，存在竞态 | `study_groups.capacity` + BEFORE INSERT 触发器锁小组行后计数 | 并发测试中 6 个请求争 1 个名额只有 1 个成功 |
| 15 | 枚举类型 | PostgreSQL enum 增值需要 ALTER TYPE | 统一 `text + CHECK` | 迁移简单、报告中容易解释 |
| 16 | 证据是否可删除 | 需求：修正时保留历史并解释原因 | `revoked_at + revoke_reason`，CHECK 二者同时为空或同时非空 | 不删除即可追溯 |
| 17 | 作答幂等 | 需求：重试只结算一次 | `attempts.submit_key` + UNIQUE(user_id, submit_key)；`evaluations.attempt_id` UNIQUE；证据 UNIQUE(attempt_id, concept_id, kind) | 三层唯一约束兜底，应用层再做二次检查 |

## 4. 合理性与规范程度的分析（大模型自评，待团队复核）

- 大多数表达到 BCNF：所有非平凡函数依赖的决定因素都是候选键（关联表、版本表、片段表、证据表）。
- 有两处有意保留的冗余，均写明维护方式：`messages.user_id`（复合外键保证一致，不满足严格 3NF）与 `learning_states`（可由证据推导的汇总，事务内重算）。
- jsonb 仅出现在 4 个与关系查询无关的字段。
- 44 张表中有 12 张属于增强功能；若团队只提交 P0/P1，可以只讲核心 32 张表。表数较多主要来自“版本化”与“多对多关联”，不是为了凑数；团队可以讨论是否合并 `concept_suggestions` 与 `message_concepts`（前者针对尚不存在的知识点，后者必须引用已有知识点，因此本设计未合并）。

## 5. 团队审阅意见（待填写）

| 审阅人 | 日期 | 同意 / 修改的条目 | 说明 |
|---|---|---|---|
|  |  |  |  |
