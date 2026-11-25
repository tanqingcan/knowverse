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

- `plants` 的数据库候选键有 `id` 与 `(garden_id, concept_id)`。在上述投影中，外观由具体植物决定。
- `learning_states` 以 `(user_id, concept_id)` 为键。当前状态另存用于主页展示，证据变更在事务中触发重算。`stage_reason` 的全局依赖待复核。
- `concepts` 的数据库候选键有 `id`。公共与个人知识点按各自范围控制名称唯一。名称规范化与条件唯一性的口径见 [函数依赖复核](normalization-analysis.md)。

简化关系 `P(user_id, concept_id, concept_name, stage)` 可以二元无损分解。两侧交集 `concept_id` 决定知识点投影的所有属性，`concept_id → concept_name` 也保留在该投影内。实际查询植物状态时，植物通过花圃和星球找到用户，再与知识点一起匹配状态。局部证明只覆盖简化关系。

外观和状态在真实表中各有相应的键。考虑更多属性或关系时，需要重新列业务 FD，逐个判断分解与依赖保持条件。

## 3. 最终模式里的两处“有意冗余”

| 位置 | 冗余内容 | 为什么保留 | 如何保证一致 |
|---|---|---|---|
| `messages.user_id` | 与 `conversations.user_id` 重复，违反 2NF | 按用户查询消息与行级权限可直接使用本表列 | 复合外键 `(conversation_id, user_id) → conversations(id, user_id)` |
| `learning_states` | 阶段可由 `learning_evidence` 推导 | 首页/花圃一次查询就要阶段，不重算 | 只在证据写入的同一事务里重算；`fn_settle_attempt` 保证原子性 |

## 4. 应用方便性的权衡

| 方案 | 规范化 | 查询便利 | 结论 |
|---|---|---|---|
| 一张宽表 | 1NF | 查询最简单 | ✘ 三类异常，且无法表达“课程目录” |
| **当前模式** | 概念、外观和学习状态分别建模 | 通过业务键和外键联合展示 | 独立维护各类事实，读路径按需要连接 |

以业务函数依赖判断规范化，按查询需求保留受控冗余，并为每项冗余明确约束或事务维护机制。
