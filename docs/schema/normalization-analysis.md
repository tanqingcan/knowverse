# 关系数据理论：函数依赖、范式与我们的取舍

> 依据课程第 6 章“关系数据理论”。候选键由 `npm run docs:keys` 从 `pg_index` 自动导出（见 `docs/schema/candidate-keys.md`，48 张表、19 张有额外唯一键）；本文件在其上做函数依赖与范式判定。
> 一句话结论：**40 张 BCNF、4 张 2NF、4 张 1NF**；所有“降级”都只为同一件事——把 `user_id`（归属用户）冗余进子表，让权限过滤与查询不必多层 JOIN，代价用约束和补偿性不变量兜住。

---

## 1. 判定方法（先说清楚我们怎么算的）

1. **键**：主键 + 所有“完整唯一索引”都是候选键；部分唯一索引（`WHERE …`）只在谓词成立时唯一，记为**条件候选键**。
2. **函数依赖**：只列非平凡的、决定因素不是超键的 FD；跨表推理出但本表内成立的 FD 也计入（例如 `messages.conversation_id → user_id`，因为一个会话只属于一个用户）。
3. **判定**：
   - 1NF：属性原子（全部满足）；
   - 2NF：不存在非主属性对候选键的**部分依赖**；
   - 3NF：不存在非主属性对候选键的**传递依赖**（等价说法：每个非平凡 FD 的决定因素是超键或主属性）；
   - BCNF：每个非平凡 FD 的决定因素都是超键；
   - 4NF：不存在非平凡的多值依赖（MVD）。
4. 本项目的表都使用 UUID 代理键 + 必要的自然唯一键；因此大多数表“只有一个候选键”，判定很直接。

---

## 2. 总览

| 最高范式 | 数量 | 表 |
|---|---|---|
| **BCNF** | 40 | users、auth_sessions、classes、class_members、sharing_preferences、cdc_consumed、cdc_offsets、audit_log、subjects、concepts、concept_aliases、concept_prerequisites、planets、gardens、plants、learning_goals、goal_concepts、conversations、message_concepts、model_calls、materials、material_versions、material_chunks、material_concepts、tasks、task_versions、task_concepts、task_hints、hint_events、evaluations、knowledge_cards、card_versions、card_sources、card_publications、learning_intents、study_groups、study_group_members、contributions、outbox_events、class_stats |
| **2NF** | 4 | learning_states、notes、attempts、growth_events |
| **1NF** | 4 | messages、concept_suggestions、message_citations、learning_evidence |

> `mv_class_stats` 是物化视图、`*_2026_10` 等是分区，二者不是独立关系模式，不参与范式统计。

---

## 3. 逐表分析

### 3.1 身份、安全与协作

| 表 | 候选键 | 非平凡 FD（键以外） | 范式 | 说明 |
|---|---|---|---|---|
| users | id、handle | — | BCNF | 两个候选键，其余属性完全依赖 |
| auth_sessions | id、token_hash | — | BCNF | 令牌哈希唯一 |
| classes | id、join_code | — | BCNF | — |
| class_members | (class_id, user_id) | — | BCNF | 全键关系 |
| sharing_preferences | (class_id, user_id) | — | BCNF | 全键关系 |
| learning_intents | id；(class,user,concept,direction)\* | — | BCNF | \*条件键：仅未撤回的意愿唯一 |
| study_groups | id | — | BCNF | — |
| study_group_members | (group_id, user_id) | — | BCNF | 全键关系 |
| contributions | id | — | BCNF | — |
| card_publications | (card_version_id, class_id) | — | BCNF | 全键关系 |
| cdc_consumed | event_id | — | BCNF | — |
| cdc_offsets | slot_name | — | BCNF | — |
| audit_log | (id, at)（分区要求） | id → at | BCNF | id 本身也是候选键；把 at 并入主键是分区物理要求，不改变语义 |

### 3.2 世界与知识

| 表 | 候选键 | 非平凡 FD（键以外） | 范式 | 说明 |
|---|---|---|---|---|
| subjects | id；(code)\*；(owner,code)\* | — | BCNF | \*条件键区分公共/个人目录 |
| concepts | id；(subject,name_norm)\*；(subject,owner,name_norm)\* | — | BCNF | 同上 |
| concept_aliases | id、(concept_id, alias_norm) | — | BCNF | 别名规范化后唯一 |
| concept_prerequisites | (concept_id, prereq_concept_id) | — | BCNF | 自反多对多，防环由触发器保证 |
| planets | id、user_id | — | BCNF | 用户 1:1 星球 |
| gardens | id、(planet_id, subject_id) | — | BCNF | — |
| plants | id、(garden_id, concept_id) | — | BCNF | 一花圃一知识点一株 |
| learning_goals | id | — | BCNF | — |
| goal_concepts | (goal_id, concept_id) | — | BCNF | 若业务上约定 `(goal_id, route_order)` 唯一，它也会是候选键（未强制，见 §7） |

### 3.3 对话

| 表 | 候选键 | 非平凡 FD（键以外） | 范式 | 说明 |
|---|---|---|---|---|
| conversations | id | — | BCNF | `(id,user_id)` 唯一索引是**冗余超键**，只为被复合外键引用 |
| **messages** | id、(conversation_id, seq) | **conversation_id → user_id** | **1NF** | 相对 `(conversation_id,seq)` 是部分依赖；相对 `id` 是传递依赖。`user_id` 是受控冗余 |
| message_concepts | (message_id, concept_id) | — | BCNF | 全键关系 |
| **concept_suggestions** | id、(message_id, name_norm) | **message_id → user_id** | **1NF** | 同上，建议必须属于同一用户 |
| model_calls | id | — | BCNF | 轨迹字段是 jsonb 日志 |

### 3.4 资料

| 表 | 候选键 | 非平凡 FD（键以外） | 范式 | 说明 |
|---|---|---|---|---|
| materials | id | — | BCNF | owner 为空即公共资料 |
| material_versions | id、(material_id, version_no) | — | BCNF | 版本不可变 |
| material_chunks | id、(version_id, ord) | — | BCNF | 片段属于不可变版本 |
| material_concepts | (version_id, concept_id) | — | BCNF | 候选概念绑定版本 |
| **message_citations** | id、(message_id, chunk_id) | **chunk_id → quote** | **1NF** | `quote` 是片段文本的快照；片段不可变，故存在部分依赖（见 §4.3） |

### 3.5 训练与成长

| 表 | 候选键 | 非平凡 FD（键以外） | 范式 | 说明 |
|---|---|---|---|---|
| tasks | id | — | BCNF | — |
| task_versions | id、(task_id, version_no) | — | BCNF | 身份/内容分离 |
| task_concepts | (task_id, concept_id) | — | BCNF | 全键关系 |
| task_hints | id、(task_version_id, ord) | — | BCNF | — |
| **attempts** | id；(user_id, submit_key)\* | **conversation_id → user_id** | **2NF** | 条件键下的幂等键；user_id 与来源会话冗余 |
| hint_events | id、(attempt_id, hint_id) | — | BCNF | — |
| evaluations | id、attempt_id | — | BCNF | 一次作答一条评价 |
| **notes** | id | **source_message_id → user_id** | **2NF** | 笔记归属用户与来源消息冗余 |
| **learning_evidence** | id；(attempt_id, concept_id, kind)\* | attempt_id/message_id/note_id → user_id | **1NF** | 相对条件键是部分依赖；`user_id` 供 RLS 与档案查询 |
| **learning_states** | (user_id, concept_id) | **stage → stage_reason** | **2NF** | 理由文案是阶段的固定模板；此外 stage 本身可由证据推导（跨关系） |
| **growth_events** | id | **evidence_id → user_id** | **2NF** | 时间轴按用户查，冗余 user_id |

### 3.6 派生与运维

| 表 | 候选键 | 说明 | 范式 |
|---|---|---|---|
| **class_stats** | class_id | 成员数/公开数/活跃时间都是其他表的聚合，由触发器增量维护 + 对账函数修复 | 形式上 BCNF；**派生汇总**，属于受控冗余 |
| outbox_events | id | 事务性 outbox | BCNF |
| knowledge_cards / card_versions / card_sources | id / id+(card_id,version_no) / (card_version_id,message_id) | 学习卡版本化 | BCNF |

---

## 4. 四张 1NF 表的详细论证（答辩重点）

### 4.1 `messages`：为什么只有 1NF

```
候选键：id、 (conversation_id, seq)
非平凡 FD：conversation_id → user_id      （一个会话只属于一个用户）
           id → conversation_id → user_id （传递）
```

- 相对 `(conversation_id, seq)`：`user_id` 只依赖 `conversation_id`（键的一部分）→ **部分依赖 → 不满足 2NF**；
- 相对 `id`：`id → conversation_id → user_id` → **传递依赖 → 不满足 3NF**。
- 取最严格结论：**1NF**。

### 4.2 `concept_suggestions`、`learning_evidence`：同一类问题

- `concept_suggestions`：候选键 `(message_id, name_norm)`，而 `message_id → user_id` → 部分依赖 → 1NF。
- `learning_evidence`：条件候选键 `(attempt_id, concept_id, kind)`，而 `attempt_id → user_id` → 部分依赖 → 1NF。

### 4.3 `message_citations`：快照带来的部分依赖

- 候选键 `(message_id, chunk_id)`，`quote` 是引用时复制的片段文本；
- 因为**片段不可变**，`chunk_id → quote` 成立 → `quote` 只依赖键的一部分 → 1NF。
- 若把 `quote` 看作“渲染后的摘录”（可能截断/加省略号），它就不是 `chunk_id` 的严格函数，此时该表可判为 BCNF。我们在文档里按**严格副本**处理，取更保守的 1NF。

---

## 5. 为什么允许降级：收益、代价、补偿

| 冗余位置 | 违反 | 收益 | 补偿机制 | 如果规范化会怎样 |
|---|---|---|---|---|
| `messages.user_id` | 2NF/3NF | 历史检索的三路候选都能直接按 `user_id` 过滤，不用先 JOIN 会话；RLS 策略只判断本行 | **复合外键** `(conversation_id,user_id) → conversations(id,user_id)`，数据库保证一致 | 每条检索都要 JOIN conversations，RLS 也要改成子查询 |
| `concept_suggestions.user_id` | 2NF | 建议列表直接按用户过滤 | 外键 + 写入路径固定（建议总是由该用户的消息产生） | 需 JOIN messages |
| `learning_evidence.user_id` | 2NF | 档案页按用户+知识点查证据，走 `(user_id,concept_id,created_at)` 索引 | 不变量 **E4**（证据与作答同属一人） | 每次查证据都要 JOIN 到 attempt/message/note |
| `message_citations.quote` | 2NF | 引用可离线渲染、审计可复现；即使片段被删除也能显示原文 | 片段不可变（版本化） | 每次渲染引用都要 JOIN 片段 |
| `notes.user_id` | 3NF | 笔记列表按用户过滤 | 不变量 **E12**（笔记与来源消息同一用户） | JOIN messages |
| `attempts.user_id` | 3NF | 幂等键 `(user_id, submit_key)` 与权限过滤 | 条件唯一索引 + 会话外键 | 幂等键要改成 `(attempt→user)` 子查询 |
| `growth_events.user_id` | 3NF | 时间轴按用户倒序，走 `(user_id, created_at)` 索引 | 不变量 **E13** | JOIN 证据表 |
| `learning_states.stage_reason` | 3NF | 档案页直接显示“为什么是这个阶段”，不用前端映射 | 阶段规则收敛在 `computeStage` 与 `fn_settle_attempt`，文案与阶段一一对应 | 删掉该列，前端按 stage 映射文案 |

**判断原则**：只有当冗余能换来“高频路径少一次 JOIN 或少一层权限判断”，并且能被**外键或可执行不变量**兜住时才保留；否则一律拆到 BCNF。

---

## 6. 无损连接与依赖保持

以“植物/知识点/状态”的分解为例（详见 `docs/schema/wide-table-vs-decomposed.md`）：

- 宽表 `P(user_id, concept_id, concept_name, subject_id, species, color, stage, …)` 中 `concept_id → concept_name, subject_id` 是部分依赖 → 1NF；
- 分解为 `concepts(id, name, subject_id)`、`plants(garden_id, concept_id, species, color)`、`learning_states(user_id, concept_id, stage, …)`；
- 公共属性 `concept_id` 是 `concepts` 的键 → 按 Chase 算法自然连接可还原原关系，**无损**；
- `concept_id → concept_name` 在 `concepts` 内保持，`(user_id,concept_id) → stage` 在 `learning_states` 内保持 → **依赖保持**。

---

## 7. 4NF / 5NF：我们其实也满足

- **4NF（多值依赖）**：如果用一个关系同时存“知识点的多个别名”和“知识点的多个先修”，会出现
  `concept_id →→ alias` 与 `concept_id →→ prereq` 两个独立多值依赖，违反 4NF。我们把它们拆成
  `concept_aliases` 与 `concept_prerequisites`，每个关系只有单值事实，因此 **BCNF 的表同时满足 4NF**。
- **5NF（连接依赖）**：本项目没有“必须三元分解才能无损”的关系（没有三元联系表）；未发现非平凡连接依赖，因此不涉及 5NF 问题。

---

## 8. 一致性怎么保证（不是“相信应用”）

| 冗余 | 强制手段 | 检查 |
|---|---|---|
| messages.user_id | 复合外键 `(conversation_id,user_id)` | 不变量 E5 |
| 证据/笔记/成长事件的 user_id | 写入路径统一 + 不变量 | E4、E12、E13 |
| 班级统计 class_stats | 触发器增量 + `fn_reconcile_class_stats()` | 不变量 E11 |
| 阶段与证据 | `fn_settle_attempt` 同事务重算 | 不变量 E1、E9 |
| 审计快照（old_row/new_row） | 只追加、不更新 | 分区裁剪测试 |

**已知风险（改进清单）**：`notes`、`growth_events`、`concept_suggestions` 的 `user_id` 目前靠“写入路径 + 不变量”保证，没有复合外键。改进方式：先给对应表加 `UNIQUE(id, user_id)`，再加 `(source_message_id, user_id)` / `(evidence_id, user_id)` 复合外键。这不会改变范式结论，只是把“补偿”从检查升级为约束。

---

## 9. 答辩问答

**Q1：为什么 `messages` 只有 1NF，还敢用于生产？**
A：`user_id` 是为权限过滤和检索性能保留的受控冗余；一致性由复合外键保证（不只是口头约定）。规范化到 BCNF 的代价是每条历史检索都多一次 JOIN，而历史检索是最高频查询。

**Q2：为什么 `learning_states` 不存 `stage_reason`？**
A：它确实是由 `stage` 决定的固定文案（所以严格判定只有 2NF）。保留它是为了档案页直接展示；如果去掉，前端需要维护同一套映射，反而容易和数据库不一致。我们的取舍是“把展示文案当作状态的一部分”。

**Q3：你们有没有 4NF？**
A：有。别名与先修是两组独立多值事实，我们拆成两张表；没有把多个多值属性塞进一个关系，所以不存在非平凡 MVD。

**Q4：反规范化会不会导致数据不一致？**
A：会，所以我们为每一处冗余都配了外键或可执行不变量（E4/E5/E11/E12/E13），并写进 `npm run verify:invariants`。当前 15 项检查 0 错误。

**Q5：如果重做会怎么选？**
A：仍然会保留 `messages.user_id` 与 `learning_evidence.user_id`（收益明确、可被约束兜住）；但会**从一开始就加复合外键**，而不是先靠写入路径。`stage_reason` 与 `quote` 会重新评估是否值得存。

---

## 10. 怎么复现这份分析

```bash
npm run docs:keys          # 候选键清单（48 张表）
npm run docs:dictionary    # 列、约束、索引
npm run verify:invariants  # 15 项一致性检查
npm test                   # 94 个集成测试
```

术语速查：

| 词 | 一句话 |
|---|---|
| 候选键 | 能唯一确定一行、且不可再删属性的最小属性组 |
| 部分依赖 | 非主属性只依赖复合键的一部分 → 破坏 2NF |
| 传递依赖 | 非主属性依赖另一个非主属性 → 破坏 3NF |
| BCNF | 每个非平凡 FD 的决定因素都是超键 |
| 无损连接 | 分解后自然连接能还原原关系，不丢不多 |
| 受控冗余 | 有意保留的重复数据，必须有约束/事务/检查兜底 |
