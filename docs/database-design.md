# 数据库设计说明：概念模型、关系模式与规范化

> 本文档为**草稿，待团队审阅**。数字（表数、约束数）由当前 migration 在 PostgreSQL 16 上实际统计得出。

## 1. 设计目标与原则

1. **关系数据库是业务权威来源**：消息、证据、状态、引用全部持久化在 PostgreSQL；浏览器只保存“记住的面板”等便利信息。
2. **一个事实只存一处**；必须冗余时（汇总状态、消息上的 `user_id`）写清楚维护方式，并让数据库约束兜底。
3. **多对多一律使用关联表**；不在字段中用逗号拼接 ID；核心业务关系不放进 JSON。
4. **jsonb 只用于不参与关系查询的内容**：判题规格 `task_versions.answer_spec`、评价维度明细 `evaluations.rubric`、模型调用轨迹 `model_calls.tool_trace`、outbox 载荷 `outbox_events.payload`。
5. **可追溯**：资料、题目、学习卡都有版本；证据修正不删除，只写撤销原因；状态变化写入成长事件。
6. **权限进入 SQL**：所有读取都带 `user_id = $1`（或“公共资料 / 本人资料”条件），不依赖前端过滤。

统计（`drizzle/0000_init.sql` + `0001_constraints_triggers.sql`）：44 张表，91 个外键，35 个 CHECK 约束，99 个索引（含 4 个 pg_trgm GIN 索引、36 个唯一或部分唯一索引），3 个业务触发器。

## 2. 概念模型（E-R）

教材风格（Chen 表示法）E-R 图位于 `docs/er/`：

| 文件 | 内容 |
|---|---|
| `er-overview.svg/png` | 总览：17 个强实体、2 个弱实体（双线矩形）、30 个联系（菱形）及基数；粗线表示全部参与 |
| `er-1-world` | 用户、星球、花圃、植物、学科、知识点、别名（弱实体）、学习目标 |
| `er-2-dialogue` | 会话、消息、模型调用、资料、资料版本（弱）、资料片段（弱），以及“标注”“引用”两个带属性的多对多联系 |
| `er-3-growth` | 题目、题目版本（弱）、提示（弱）、作答、评价、学习证据、笔记、成长事件，以及带属性的“当前状态”联系 |
| `er-4-class` | 班级、学习意愿、共学小组、贡献（三元联系）、学习卡与卡片版本（弱） |

图由 `docs/er/gen_er.py`（Graphviz）生成，可编辑后重新运行。

### 2.1 关键的实体边界判断

| 问题 | 结论与理由 |
|---|---|
| 知识点与植物是不是同一实体？ | **不是**。知识点是学科中的概念（可多人共享课程目录）；植物是“某个用户的花圃里对这个知识点的外观实例”（花种、花色、位置）。更换外观只改 `plants`，学习记录挂在（用户, 知识点）上，因此不受影响。 |
| 学习状态挂在植物上还是（用户, 知识点）上？ | 挂在 **（用户, 知识点）**：同一知识点即使植物被删除或重种，证据与状态也不丢失；`learning_states` 是“用户—知识点”联系的属性。 |
| 会话消息与练习作答是否合并？ | **分开**。消息是对话文本；作答有题目版本、模式、幂等键、提示使用和评价，生命周期不同。 |
| 资料、版本、片段的关系 | 版本是资料的弱实体（版本号只在资料内唯一）；片段是版本的弱实体（序号只在版本内唯一）。引用绑定到片段，从而绑定到**不可变的版本**。 |
| 题目与题目版本 | 作答引用题目版本；题目修改产生新版本，旧作答的判题依据不变。“题族”`family_key` 把原题与变式联系起来。 |
| 状态历史与成长事件是否拆成两张表？ | **合并为 `growth_events`**（`event_type` 区分 planted / evidence_added / stage_changed / evidence_revoked / appearance_changed / natal_chosen）。二者都是“按时间追加、按用户与知识点回看”的事件流，时间轴与回放只需读一张表；拆表只会增加 UNION。 |
| AI 提出的新概念放哪里？ | `concept_suggestions`。AI 只能提议，用户接受后才在 `concepts` 中建立个人知识点；不会自动合并或新建。 |

## 3. 关系模式

关系模式图：`docs/schema/schema-core.svg`（P0/P1 核心 32 张表）与 `docs/schema/schema-enhanced.svg`（增强 12 张表），由 `docs/schema/gen_schema.py` 从数据库目录自动生成，与实际 migration 一致。

以下按模块列出（下划线为主码，`→` 为外码）：

**身份与世界**
- users(<u>id</u>, handle UNIQUE, display_name, password_hash, is_demo, timezone, reduced_motion, render_mode, onboarded_at, last_conversation_id → conversations, last_plant_id → plants, created_at)
- auth_sessions(<u>id</u>, user_id → users, token_hash UNIQUE, created_at, expires_at, revoked_at)
- planets(<u>id</u>, user_id → users UNIQUE, name, sky_theme, natal_plant_id → plants DEFERRABLE, created_at)
- subjects(<u>id</u>, owner_user_id → users NULL=公共, code, name, description)；公共 code 唯一、个人 (owner, code) 唯一（部分唯一索引）
- concepts(<u>id</u>, subject_id → subjects, owner_user_id → users, name, name_norm, summary, archived_at)；(subject, name_norm) 在公共/个人范围内唯一
- concept_aliases(<u>id</u>, concept_id → concepts, alias, alias_norm)；UNIQUE(concept_id, alias_norm)
- concept_prerequisites(<u>concept_id → concepts, prereq_concept_id → concepts</u>)；CHECK 不自指 + 触发器防环
- gardens(<u>id</u>, planet_id → planets, subject_id → subjects, name, sort_order)；UNIQUE(planet_id, subject_id)
- plants(<u>id</u>, garden_id → gardens, concept_id → concepts, species, color, nickname, lon, lat)；UNIQUE(garden_id, concept_id)
- learning_goals(<u>id</u>, user_id → users, subject_id → subjects, title, status)
- goal_concepts(<u>goal_id → learning_goals, concept_id → concepts</u>, route_order)

**对话与历史**
- conversations(<u>id</u>, user_id → users, title, subject_id, goal_id, focus_concept_id, origin, created_at, updated_at, archived_at)；UNIQUE(id, user_id) 供复合外键引用
- messages(<u>id</u>, (conversation_id, user_id) → conversations(id, user_id), seq, role, content, status, mode, reply_to_id → messages, model_call_id → model_calls, basis, error_message, created_at, completed_at)；UNIQUE(conversation_id, seq)
- model_calls(<u>id</u>, user_id → users, purpose, mode, provider, model, status, started_at, finished_at, latency_ms, prompt_tokens, completion_tokens, error_code, error_message, tool_trace jsonb)
- message_concepts(<u>message_id → messages, concept_id → concepts</u>, source, status, confidence, decided_at)
- concept_suggestions(<u>id</u>, user_id, message_id → messages, subject_id, raw_name, name_norm, status, accepted_concept_id → concepts)；UNIQUE(message_id, name_norm)
- message_citations(<u>id</u>, message_id → messages, chunk_id → material_chunks, ref_label, quote, ord)；UNIQUE(message_id, chunk_id)

**资料**
- materials(<u>id</u>, owner_user_id → users NULL=课程公共, subject_id, title, course, kind, archived_at)
- material_versions(<u>id</u>, material_id → materials, version_no, file_name, file_type, mime_type, byte_size, sha256, storage_path, status, status_detail, page_count, uploaded_by_user_id, uploaded_at, processed_at)；UNIQUE(material_id, version_no)
- material_chunks(<u>id</u>, version_id → material_versions, ord, page_no, paragraph_no, heading, content)；UNIQUE(version_id, ord)
- material_concepts(<u>version_id → material_versions, concept_id → concepts</u>, status, hit_count)

**练习、证据与成长**
- tasks(<u>id</u>, subject_id, owner_user_id, kind, title, family_key)；task_concepts(<u>task_id, concept_id</u>)
- task_versions(<u>id</u>, task_id → tasks, version_no, prompt, is_variant, difficulty, answer_spec jsonb, dataset_key, source, source_chunk_id, model_call_id)；UNIQUE(task_id, version_no)
- task_hints(<u>id</u>, task_version_id → task_versions, ord, content)；UNIQUE(task_version_id, ord)
- attempts(<u>id</u>, user_id → users, task_version_id → task_versions, mode, conversation_id, answer, status, submit_key, started_at, submitted_at)；UNIQUE(user_id, submit_key)
- hint_events(<u>id</u>, attempt_id → attempts, hint_id → task_hints, shown_at)；UNIQUE(attempt_id, hint_id)
- evaluations(<u>id</u>, attempt_id → attempts UNIQUE, evaluator, verdict, score, feedback, rubric jsonb, uncertainty, model_call_id)
- notes(<u>id</u>, user_id, concept_id, source_message_id → messages, title, content)
- learning_evidence(<u>id</u>, user_id, concept_id, kind, attempt_id, message_id, note_id, material_version_id, used_hints, ai_assisted, detail, origin, created_at, revoked_at, revoke_reason)；UNIQUE(attempt_id, concept_id, kind) WHERE attempt_id IS NOT NULL；CHECK 撤销时间与原因同时存在
- learning_states(<u>user_id → users, concept_id → concepts</u>, stage, stage_reason, last_evidence_at, review_due_at, updated_at, version)
- growth_events(<u>id</u>, user_id, concept_id, event_type, from_stage, to_stage, evidence_id → learning_evidence, reason, origin, created_at)

**增强**：classes、class_members(<u>class_id, user_id</u>)、sharing_preferences(<u>class_id, user_id</u> → class_members)、learning_intents((class_id, user_id) → class_members)、study_groups、study_group_members(<u>group_id, user_id</u>)、contributions((group_id, user_id) → study_group_members)、knowledge_cards、card_versions(UNIQUE(card_id, version_no))、card_sources(<u>card_version_id, message_id</u>)、card_publications(<u>card_version_id, class_id</u>)、outbox_events(<u>id</u> identity)。

> 复合外键的作用：`contributions` 只能由小组成员写入；`learning_intents`、`sharing_preferences` 只能属于班级成员。这些“成员资格”约束由数据库保证，而不是只靠应用代码。

## 4. 规范化分析

以下各模式均以当前实现为准。记号：K 为候选键，F 为函数依赖集。

### 4.1 选课式反例：为什么 `plants` 与 `concepts`、`learning_states` 分开

若把它们合成一张“植物”宽表：

P(user_id, concept_id, concept_name, subject_id, species, color, lon, lat, stage, stage_reason)

F = { concept_id → concept_name, subject_id；(user_id, concept_id) → species, color, lon, lat, stage, stage_reason }

候选键 K = (user_id, concept_id)。`concept_name`、`subject_id` 只依赖 K 的一部分 `concept_id`，是**部分依赖**，P 只满足 1NF。后果：
- 更新异常：知识点改名要改所有用户的所有行；
- 插入异常：课程目录里的新知识点在没有人种下之前无法存在；
- 删除异常：最后一个用户删除植物，知识点信息随之消失。

分解为：
- concepts(concept_id, name, subject_id)　F₁ = { concept_id → name, subject_id }，K = concept_id，BCNF；
- plants(plant_id, garden_id, concept_id, species, color, lon, lat)，K = plant_id 与 (garden_id, concept_id)，所有非平凡依赖的左部都是超键，BCNF；
- learning_states(user_id, concept_id, stage, …)，K = (user_id, concept_id)，BCNF。

**无损连接**：以 concepts 与“其余属性”分解为例，R₁ ∩ R₂ = {concept_id}，且 concept_id → R₁（concept_id 是 R₁ 的键），满足 Heath 定理条件，分解无损；依赖也全部保持在各自的模式中。

### 4.2 `messages`：受控冗余的 user_id（3NF 的有意例外）

messages(id, conversation_id, user_id, seq, role, content, …)

F 中有 id → conversation_id，conversation_id → user_id（会话属于一个用户），因此 id → user_id 是**传递依赖**，严格来说 messages 不满足 3NF（user_id 是非主属性且传递依赖于键）。

保留它的原因：历史检索的每个子查询都需要“本人”条件，`messages_user_created_idx (user_id, created_at)` 与三路关键词候选都直接以 `user_id = $1` 过滤；若不冗余，每次都要与 conversations 连接后才能过滤权限。

一致性维护：**复合外键** `(conversation_id, user_id) REFERENCES conversations(id, user_id)`。数据库保证 messages.user_id 永远等于所属会话的 user_id，冗余不会产生不一致（更新异常被约束消除）。这是“规范化程度 vs 应用开发便利”的一个明确权衡。

### 4.3 资料版本、片段与引用

- material_versions(id, material_id, version_no, file_name, sha256, status, …)：K = id，也可 (material_id, version_no)。F = { id → 其余；(material_id, version_no) → 其余 }，所有决定因素都是候选键，BCNF。
- material_chunks(id, version_id, ord, page_no, paragraph_no, content)：K = id 与 (version_id, ord)，BCNF。
- message_citations(id, message_id, chunk_id, ref_label, quote, ord)：K = id 与 (message_id, chunk_id)。

一个容易出错的设计是在 message_citations 中再存 `material_id`、`version_no`、`page_no`：它们都由 chunk_id 决定（chunk_id → version_id → material_id），是传递依赖，并且会在资料更新时产生“引用显示的页码与实际片段不符”的更新异常。本设计只存 chunk_id；由于片段属于**不可变的版本**（新内容只能产生新版本），引用永远指向当时依据的那段文字。`quote` 是引用时的摘录快照，用于展示与审计，不参与任何依赖推导（可视为“事件发生时的值”，而不是可更新的事实）。

### 4.4 `learning_states` 汇总与 `learning_evidence`

learning_states(user_id, concept_id, stage, stage_reason, last_evidence_at, review_due_at, version)

stage 实际上是“该用户该知识点所有有效证据的函数”：stage = f({ kind | evidence(user, concept), revoked_at IS NULL })。从信息角度它是**可推导的冗余**。

保留原因：星球首页需要一次性取出全部植物的阶段，若每次都聚合证据，查询要对每株植物做分组与规则计算；汇总表让首页读取变为一次主键连接。

一致性维护：
1. 只有 `src/server/growth.ts` 的 `addEvidence / revokeEvidence` 能改变状态，并且总在同一事务中：写证据 → `SELECT … FOR UPDATE` 锁定状态行 → 按全部有效证据**重新计算**（不是增量 +1）→ 写状态 → 写 growth_events → 写 outbox；
2. 重新计算而不是增量更新，因此即使历史中有撤销，结果也与证据一致；
3. 可以随时从证据重建汇总（测试“撤销证据后重新计算”覆盖了这一点）。

growth_events 的设计：它记录的是**发生过的事件**（含当时的 from/to 阶段与原因），属于追加型日志，不会被更新，因此不存在更新异常；它不替代证据，只用于时间轴与回放。

### 4.5 `goal_concepts`、`message_concepts`、`task_concepts`

三者都是纯关联表，K 为两个外码组合；非主属性（route_order、source、status、confidence）完全依赖整个键，BCNF。用关联表而不是数组/逗号字段，使“按知识点检索历史”可以直接走 `message_concepts_concept_idx (concept_id, status)`。

## 5. 约束、索引与查询的对应

| 真实查询条件 | 索引 / 约束 |
|---|---|
| 历史：本人 + 时间 | `messages_user_created_idx (user_id, created_at)` |
| 历史：关键词（问题/回答/标题） | `messages_content_trgm_idx`、`conversations_title_trgm_idx`（GIN gin_trgm_ops） |
| 历史：知识点 | `message_concepts_pk (message_id, concept_id)`、`message_concepts_concept_idx (concept_id, status)` |
| 定位原消息 | `messages_conv_seq_uq (conversation_id, seq)` |
| 助手回复查找 | `messages_reply_idx (reply_to_id)` |
| 资料检索 | `material_chunks_content_trgm_idx` |
| 作答幂等 | `attempts_user_submit_key_uq (user_id, submit_key)` |
| 一次作答一条评价 | `evaluations_attempt_uq` |
| 证据不重复 | `learning_evidence_attempt_concept_uq (attempt_id, concept_id, kind) WHERE attempt_id IS NOT NULL` |
| 待复习 | `learning_states_review_idx (user_id, review_due_at)` |
| 时间轴 | `growth_events_user_created_idx (user_id, created_at)` |
| outbox 未投递 | 部分索引 `outbox_undelivered_idx (id) WHERE delivered_at IS NULL` |
| 伙伴匹配 | `learning_intents_match_idx (class_id, concept_id, direction)`，有效意愿部分唯一索引 |

中文关键词说明：pg_trgm 对中文同样提取三元组（测试库中 `show_trgm('条件概率')` 返回 5 个三元组），因此 ≥3 字的中文词可以使用 GIN 索引；**两个字**的词短于三元组，只能在本人的消息范围内扫描，正确性仍由 ILIKE 保证。实测计划与耗时见 `docs/sql/explain-results.md`。用户输入的 `%`、`_`、`\` 会被转义。

时间筛选：用户选择的是**自己时区**的自然日，SQL 中写成 `created_at >= (from::date)::timestamp AT TIME ZONE tz AND created_at < ((to::date + 1)::timestamp AT TIME ZONE tz)`，即左闭右开，含起止两天；时区存于 `users.timezone`（默认 Asia/Taipei）。

## 6. 删除、归档与引用保留策略

| 数据 | 策略 |
|---|---|
| 会话 | 用户“删除”= 设置 `archived_at`，不再出现在列表与检索中；消息、引用与证据保留（证据可能引用这些消息） |
| 资料 | 归档 `archived_at`；版本与片段 **不物理删除**（`ON DELETE RESTRICT`），保证旧回答的引用仍可打开 |
| 题目 | 题目归档；题目版本被作答引用，RESTRICT |
| 学习证据 | 修正 = `revoked_at + revoke_reason`，CHECK 要求二者同时存在；状态重新计算并写 `evidence_revoked` 事件 |
| 学习卡 | 每次修订新增 `card_versions`；发布到班级时撤下旧公开版本（`withdrawn_at`），记录保留 |
| 账户 | 个人从属数据随账户 CASCADE 删除；个人数据内部互相引用使用 NO ACTION（语句结束时检查），保证整账户删除能在一条语句内完成；共享的课程目录、公共资料使用 RESTRICT |
| 上次上下文 | `users.last_conversation_id / last_plant_id` 为 `ON DELETE SET NULL` 的软引用 |

## 7. 事务与一致性

- **模型调用在短事务之外**：对话先在事务 1 中保存用户消息与 `pending` 占位，调用模型（可能几十秒）在事务外进行，事务 2 写回答、引用、标签与证据。中断后 `pending` 超时会被标记为“中断，可重试”，重试只能认领 `failed` 状态的消息（并发重试只有一个成功认领）。
- **作答结算**：评价（沙箱执行或模型评分）在事务外完成；事务内 `FOR UPDATE` 锁作答并二次检查，唯一索引兜底并发重复提交；证据、状态、成长事件、outbox 一致提交或一致回滚（测试中用注入故障验证）。
- **并发名额**：触发器对小组行 `FOR UPDATE` 后计数，6 个并发请求争 1 个名额时恰好 1 个成功（测试验证）。
- **outbox**：业务事务内写入，`FOR UPDATE SKIP LOCKED` 批量投递；本项目的投递目标是服务端日志，未接入外部消息系统。
- **本命花互相引用**：planets.natal_plant_id 与 plants 构成环形引用，外键设为 `DEFERRABLE INITIALLY DEFERRED`，并用延迟约束触发器保证本命花属于本星球。
