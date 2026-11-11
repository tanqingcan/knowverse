# 模式选择：宽表、分解与无损连接

用于报告「从规范化程度和应用开发的方便性综合评判最终模式」一节。反例是设计过程中真实出现过的候选，不是虚构的。

## 1. 反例：一张宽表

```
P(user_id, concept_id, concept_name, subject_id, species, color, lon, lat,
  stage, stage_reason, last_evidence_at, review_due_at, nickname)
```

候选键：`(user_id, concept_id)`。数据里存在这些函数依赖：

| 依赖 | 说明 |
|---|---|
| `(user_id, concept_id) → species, color, lon, lat, nickname` | 该用户这一株的外观 |
| `concept_id → concept_name, subject_id` | **部分依赖**：概念名只由知识点决定 |
| `(user_id, concept_id) → stage, stage_reason, last_evidence_at` | 该用户对这一知识点的状态 |

`concept_id → concept_name` 违反 2NF（更谈不上 3NF/BCNF），会带来三类异常：

| 异常 | 具体表现 |
|---|---|
| 更新异常 | 改一个知识点名要改所有用户的所有行，漏改就出现两个名字 |
| 插入异常 | 课程目录里新增知识点、但还没有用户种花时，无处存放 |
| 删除异常 | 最后一个用户删掉这株花，知识点与别名信息一起消失 |

## 2. 分解

```
concepts(id, name, subject_id, owner_user_id, …)         -- 知识点是共享的
plants(id, garden_id, concept_id, species, color, lon, lat, nickname)  -- 某人的一株花（外观）
learning_states(user_id, concept_id, stage, stage_reason, last_evidence_at, review_due_at)  -- 某人对某知识点的状态
```

- `plants` 的候选键 `(garden_id, concept_id)`（一个花圃里一个知识点一株），所有非主属性完全依赖它 → BCNF；
- `learning_states` 的候选键 `(user_id, concept_id)`，非主属性只依赖这个键 → BCNF；
- `concepts` 的候选键 `id`，`name` 受 `(subject_id, name_norm)` 唯一约束保护 → BCNF。

**无损连接**：分解的公共属性是 `concept_id`，它是 `concepts` 的键，按分解的无损连接判定（Chase 算法）可自然连接回原关系；同时 `plants` 与 `learning_states` 通过 `(user_id, concept_id)` 关联，信息不丢。

**依赖保持**：`concept_id → concept_name` 在 `concepts` 中保持；状态相关依赖在 `learning_states` 中保持；外观依赖在 `plants` 中保持。

## 3. 最终模式里的两处“有意冗余”

| 位置 | 冗余内容 | 为什么保留 | 如何保证一致 |
|---|---|---|---|
| `messages.user_id` | 与 `conversations.user_id` 重复 | 历史检索的每条子查询都要按 user_id 过滤，省一次 JOIN | 复合外键 `(conversation_id, user_id) → conversations(id, user_id)` |
| `learning_states` | 阶段可由 `learning_evidence` 推导 | 首页/花圃一次查询就要阶段，不重算 | 只在证据写入的同一事务里重算；`fn_settle_attempt` 保证原子性 |

## 4. 应用方便性的权衡

| 方案 | 规范化 | 查询便利 | 结论 |
|---|---|---|---|
| 一张宽表 | 1NF | 查询最简单 | ✘ 三类异常，且无法表达“课程目录” |
| 完全按 3NF 拆到底 | 3NF/BCNF | 展示一次花圃要 5 次 JOIN | 拆到 `plants / learning_states / concepts` 为止 |
| **当前模式** | **多数 BCNF，两处受控冗余** | 关键查询 1–2 次 JOIN | ✅ 采用 |

结论：**先满足 BCNF，再为高频读路径保留可证明一致的冗余**；冗余必须有约束或事务保证，不能只靠“代码里记得同步”。
