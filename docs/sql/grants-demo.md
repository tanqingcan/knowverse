# 授权与视图机制演示（第 4 章）

> 由 `npm run demo:grants` 生成；全部在事务内完成并回滚，不改变实际权限。

| 操作 | 结果 | 说明 |
|---|---|---|
| kv_app 建表（应拒绝） | 拒绝 42501 | permission denied for schema public |
| kv_teacher 读教师视图（应允许） | 允许 | 视图行数 1 |
| kv_teacher 读 messages（应拒绝） | 拒绝 42501 | permission denied for table messages |
| 对 kv_teacher REVOKE 视图后读取（应拒绝） | 拒绝 42501 | permission denied for view v_teacher_concept_heat |
| WITH GRANT OPTION 转授（应允许） | 允许 | 转授后 kv_demo_reader 读到 1 行 |
| 列级授权：只读 concepts(id,name)（应允许） | 允许 | 读到 SELECT 查询 |
| 列级授权：SELECT * 访问未授权列（应拒绝） | 拒绝 42501 | permission denied for table concepts |

## 对应课堂知识点

- **自主存取控制（DAC）**：`GRANT`/`REVOKE`、`WITH GRANT OPTION`、角色。本项目运行时角色 `kv_app` 无 DDL；教师角色 `kv_teacher` 只有视图的 SELECT。
- **视图机制**：教师子模式（`v_teacher_class_overview`、`v_teacher_concept_heat`）只暴露聚合，不暴露学生个人内容；角色只被授予视图，底层表不可见。
- **列级授权**：`GRANT SELECT (id, name) ON concepts` 后，`SELECT *` 会因为缺少其他列权限被拒绝——说明 PostgreSQL 的权限粒度到列。
- **审计**：与 `audit_log`（按月分区）配合，敏感表变更可追溯；`npm run security:audit` 可复核角色属性与 RLS 覆盖。
