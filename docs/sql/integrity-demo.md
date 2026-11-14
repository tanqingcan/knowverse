# 完整性违约演示（第 5 章）

> 由 `npm run demo:integrity` 生成；每条都在事务里执行并回滚，不会留下脏数据。

| 完整性规则 | 违约尝试 | SQLSTATE | 约束/触发器 |
|---|---|---|---|
| 实体完整性（主键） | 重复插入同一个 (班级, 成员) | `23505` | `class_members_pk` |
| 参照完整性（外键） | 消息指向不存在的会话 | `23503` | `messages_conversation_user_fk` |
| 参照完整性（RESTRICT） | 删除仍被其他表引用的知识点 | `23503` | `goal_concepts_concept_id_concepts_id_fk` |
| 用户定义完整性（CHECK） | 把消息状态写成非法值 | `23514` | `messages_status_ck` |
| 用户定义完整性（NOT NULL） | 插入内容为空的消息 | `23502` | `ExecConstraints` |
| 用户定义完整性（唯一约束） | 重复的班级邀请码 | `23505` | `classes_join_code_uq` |
| 触发器（先修关系防环） | 让 内连接 依赖它自己的后继 | `23514` | `exec_stmt_raise` |
| 延迟约束（DEFERRABLE） | 把本命花改成别人星球上的花 | `23514` | `exec_stmt_raise` |
| 触发器（共学名额） | 先填满小组，再插最后一个人 | `P0001` | `exec_stmt_raise` |

## 说明

- **实体完整性**：主键/唯一索引拒绝重复元组（`23505`）。
- **参照完整性**：外键拒绝孤儿引用（`23503`）；`RESTRICT` 拒绝删除被引用行；`CASCADE`/`SET NULL` 的行为在迁移里声明。
- **用户定义完整性**：`CHECK`（`23514`）、`NOT NULL`（`23502`）、唯一约束（`23505`）。
- **触发器**：先修关系防环、共学名额等跨行规则由触发器保证（`23514`/`P0001`）。
- **延迟约束**：本命花的归属检查在 `COMMIT` 时才触发（`DEFERRABLE INITIALLY DEFERRED`），允许同一事务里先建星球再建植物。
- 课程提到的 **ASSERTION**：PostgreSQL 不提供 `CREATE ASSERTION`，跨表断言只能用触发器/约束触发器表达，这里正是这样实现的。
