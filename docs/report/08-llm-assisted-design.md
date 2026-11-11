# 8 大模型辅助数据库设计记录

> 负责人：A。原始过程记录见 `docs/llm-assisted-design.md`，本章是**团队审阅版**：补上分类统计、逐条合理性分析、与最终库的核对，以及团队意见的填写位。
> 课程要求：使用大模型辅助时，要记录辅助得到的结果，并分析其合理性与规范程度。

## 8.1 过程与角色

| 项 | 内容 |
|---|---|
| 时间 | 2026-10-26（初版实现）／2026-10-27（团队复核与二次改造） |
| 参与者 | 团队成员提出需求、候选表清单与约束；大模型（Claude）完成审查、修改与实现；A 在第二轮做数据库能力改造并复核本章 |
| 输入 | ① 课程附件《大作业描述 261020.pptx》；② 候选表清单（见 §8.2）；③ 约束：多对多用关联表、不拼接 ID、核心关系不放 JSON、版本与引用绑定、状态可追溯 |
| 方法 | 逐实体检查边界 → 写函数依赖与候选键 → 对照真实查询确认索引 → 用迁移与测试验证约束（幂等、回滚、并发、隔离、RLS） |
| 产出 | `src/db/schema.ts` → `drizzle/0000_init.sql`；手写 `0001`–`0018`；E-R 图、数据字典、EXPLAIN 记录 |

**必须说明的边界**：任务说明里的候选清单是否也由模型产生，记录者无法确认，因此称为“初始候选”；§8.4 的判断是**模型给出的分析 + 团队的复核**，不是模型的自我认证。

## 8.2 初始候选（33 张表）

基础：users、sessions、planets、gardens、plants、subjects、concepts、concept_aliases、learning_goals、goal_concepts、conversations、messages、message_concepts、materials、material_versions、material_chunks、message_citations。
训练与成长：task_versions、attempts、hint_events、evaluations、learning_evidence、learning_states、state_history、growth_events。
增强：knowledge_cards、card_versions、classes、class_members、sharing_preferences、learning_intents、study_groups、study_group_members、contributions、outbox_events。

最终为 **45 张（44 普通表 + 1 分区表）**，差异全部来自 §8.3 的审查。

## 8.3 17 条审查的分类

| 类别 | 条目 | 数量 |
|---|---|---|
| 表的拆分 / 合并（消除部分依赖、避免为拆而拆） | #2 题目拆身份与版本、#3 合并 state_history 与 growth_events、#9 候选概念绑定版本 | 3 |
| 约束下沉到数据库 | #8 先修防环、#12 本命花环形引用、#13 成员资格复合外键、#14 共学名额、#15 枚举用 text+CHECK、#17 幂等三层唯一 | 6 |
| 冗余与一致性 | #4 messages.user_id 受控冗余、#5 引用只存 chunk_id | 2 |
| 语义与命名 | #1 sessions 改名 auth_sessions、#7 建议与事实分离、#10 笔记独立实体 | 3 |
| 新增实体以承载过程数据 | #6 model_calls、#11 学习卡来源与发布、#16 证据撤销而非删除 | 3 |

## 8.4 逐条合理性分析（选 8 条）

| # | 模型建议 | 我们的判断 | 依据 / 证据 |
|---|---|---|---|
| 2 | 把 `task_versions` 拆成 `tasks` + `task_versions` + `task_concepts` + `task_hints` | **合理**。题型、学科、考查知识点只依赖 `task_id`，放进版本表会对 `(task_id, version_no)` 产生部分依赖 | 数据字典中 `task_versions` 无题型列；`task_concepts` 以 `task_id` 关联；BCNF |
| 3 | `state_history` 与 `growth_events` 合并 | **合理但有权衡**。两者都是追加事件流、主读法相同；合并后靠 `event_type` 区分，减少一张表和一次 UNION。代价是单表语义略宽，用 CHECK 约束取值 | `growth_events` 有 `from_stage/to_stage/evidence_id/reason`，`tests/practice-growth.test.ts` 断言事件类型集合 |
| 4 | 保留 `messages.user_id` 冗余 | **合理**。历史检索的三路候选都要按 user_id 过滤；但必须用复合外键保证与 `conversations.user_id` 一致，否则是失控冗余 | 数据字典：`(conversation_id, user_id) → conversations(id, user_id)`；`docs/schema/wide-table-vs-decomposed.md` §3 |
| 5 | `message_citations` 只存 `chunk_id` + 引用快照 | **合理**。片段属于不可变版本，页码/段落自然绑定；若冗余 `page_no` 会产生传递依赖，且版本更新后“页码对不上” | `material_versions` 不可变（只新增版本）；引用表无 `page_no` 列 |
| 8 | 先修关系用递归 CTE 触发器防环 | **合理且必要**。应用层很难可靠防止间接环；数据库触发器是唯一能拦住所有写入路径的位置 | `0001` 中的 `kv_check_prereq_cycle`；插入成环时抛 23514 |
| 12 | 本命花用 `planets.natal_plant_id` + DEFERRABLE 外键 + 延迟约束触发器 | **合理**。单值属性放在它所属的实体（星球）上；环形引用只能用可延迟约束解决 | `0001`：`DEFERRABLE INITIALLY DEFERRED` + `planets_natal_plant_ck` |
| 14 | 共学名额用 BEFORE INSERT 触发器锁小组行后计数 | **合理**。应用层“先查后插”存在竞态；触发器内 `FOR UPDATE` 是数据库层最小代价的正确做法 | 并发测试：6 个请求争 1 个名额恰好 1 个成功 |
| 17 | 幂等用 `(user_id, submit_key)` 唯一 + `evaluations.attempt_id` 唯一 + 证据三元组唯一 | **合理**。三层唯一约束分别兜住“重复提交、重复评价、重复证据”，应用层只做快速路径 | `fn_settle_attempt` 内再查一次幂等；真实 PG 错误 23505 |

### 8.4.1 我们**没有**采纳或需要修正的地方

| 模型输出 | 问题 | 处理 |
|---|---|---|
| 统计口径“282 个 CHECK” | `information_schema` 把 NOT NULL 也列成 CHECK；`pg_constraint` 里真正的业务 CHECK 只有 **41** 个 | 全部文档改用 `pg_constraint` 口径；数据字典脚本过滤 `*_not_null` |
| 枚举用 `text + CHECK` | 合理，但 CHECK 名称需要人工命名（否则是 `2200_*` 自动名），不利于报告解释 | 采纳方案，补命名规范：`<table>_<column>_ck` |
| 覆盖索引建议（“加索引减少回表”） | 实测让两字中文检索从 88.6 ms 退化到 1412.5 ms | 删除该索引，记录在 `docs/sql/index-decisions.md` |
| 文档里的“44 张表” | 引入 `audit_log` 后是 45 张；分区子表又不该重复计数 | 统一口径：44 普通表 + 1 分区表（5 个分区） |

## 8.5 规范程度评估

| 维度 | 评估 |
|---|---|
| 范式 | 绝大多数表达到 BCNF；两处受控冗余（`messages.user_id`、`learning_states`），均有约束或事务保障 |
| 键设计 | 全部表有主键；多对多用关联表；版本表用 `(id, version_no)`；无拼接 ID |
| 完整性 | 92 外键、44 CHECK、9 触发器、5 组复合外键、1 组延迟约束 |
| JSON 使用 | 仅 4 处（判题规格、评分维度、模型轨迹、outbox 载荷），均不参与关系查询 |
| 命名 | 表名复数、列名 snake_case；约束名带表名前缀；枚举 CHECK 统一后缀 `_ck` |
| 可演进 | `text + CHECK` 便于扩展取值；迁移按能力分批（0000–0028），可重放 |

## 8.6 与最终数据库的核对

| 核对项 | 结果 |
|---|---|
| 迁移可重放 | `npm run db:reset` → 0000–0028 全部执行成功 |
| 表 / 列 | 44 普通表 + 1 分区表；390 列 |
| 约束 | 92 外键；44 CHECK（`pg_constraint`）；9 触发器；RLS 18 张表 / 18 条策略 |
| 索引 | 99 个（95 B 树 + 4 GIN trgm）；另有两个部分索引见 §3.5 |
| 测试 | 90 个集成测试全绿（含 RLS、班级星系、结算函数、审计分区、注入防护） |
| 文档一致性 | 数据字典由 `npm run docs:dictionary` 从库反向生成，重跑内容不变 |

## 8.7 团队审阅意见（待填）

> 课程要求“分析合理、规范程度”。上文的判断由 A 起草，需要 B/C/D 各自确认或反对；有异议的条目请在“意见”列写理由。

| 审阅人 | 日期 | 同意的条目 | 有异议的条目与理由 |
|---|---|---|---|
| B |  |  |  |
| C |  |  |  |
| D |  |  |  |

**建议每人至少回答一个问题**：

1. `state_history` 合并进 `growth_events`（#3）后，答辩时如何解释“历史可追溯”？
2. `messages.user_id` 的冗余（#4）如果去掉，历史检索会多几次 JOIN、性能影响多大？
3. 先修防环放在触发器（#8）而不是应用层，代价是什么（可移植性、调试）？
4. `learning_states` 是汇总表，如果它和证据不一致，如何发现与修复？
5. 本章哪些结论是**实测**，哪些只是**推理**？（答案应在表里标出来）

## 8.8 局限与反思

- 模型擅长“按规则检查结构”（部分依赖、冗余、约束位置），不擅长判断**产品价值**（这 45 张表是否都必要）与**成本**（索引、分区的运维代价）；这些必须由团队用数据回答。
- 模型给出的数字与结论必须回到数据库核对——本章就修正了“282 个 CHECK”与“覆盖索引更好”两个错误。
- 本章的“合理”是**在给定需求下**的合理，不代表唯一解；`state_history` 是否合并、`learning_states` 是否保留，答辩时应能说出取舍理由。




