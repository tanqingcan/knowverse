# 课程对照：每一章讲了什么，我们怎么做、又往前走了哪一步

> 依据：课堂 PPT 第 1、5、7、8 章与《动态 Web 编程简介》。
> 用法：答辩时按章节挑 2–3 条讲；每条都有「实现位置 / 现场命令 / 比课堂多走的一步」。

---

## 第 1 章 数据库安全性

| 课堂知识点 | 我们的实现 | 现场演示 | 比课堂多走的一步 |
|---|---|---|---|
| 用户身份鉴别 | 口令 `scrypt` 加盐哈希 + `auth_sessions` 存的是令牌 SHA-256，Cookie 为 `httpOnly` | `npm test -- tests/security.test.ts` | 会话表与用户表分离；令牌泄露不可直接复用 |
| SQL 注入 | 全部 SQL 参数化；`LIKE` 的 `%`/`_` 显式转义 | `npm test -- tests/injection.test.ts`（6 组 payload） | 用注入串打自己的接口，证明表还在、行数不变 |
| 自主存取控制（DAC） | 运行时角色 `kv_app`：无 DDL、`NOSUPERUSER`、`NOBYPASSRLS` | `npm run demo:grants` | 权限不是写在代码里，而是数据库角色 |
| GRANT / REVOKE / WITH GRANT OPTION | 教师角色 `kv_teacher` 只被授予视图；演示了转授与即时收回 | `npm run demo:grants` | 收回权限立刻生效（事务内 REVOKE 后查询被拒） |
| 数据库角色 | `kv_app`（应用）、`kv_sandbox`（只读练习库）、`kv_teacher`（子模式） | `npm run security:audit` | 三类角色对应三种信任级别 |
| 视图机制 | 教师子模式 `v_teacher_class_overview`、`v_teacher_concept_heat` 只暴露聚合 | `npm run demo:grants` | 角色只有视图权限，底层表不可见 |
| 审计 | `audit_log` 按月分区；触发 `sharing_preferences` / `class_members` / `learning_evidence` | `npm test -- tests/audit.test.ts` | 按时间分区 + 审计表自身 RLS |
| 数据加密 | 口令只存哈希；传输层由部署负责（HTTPS） | — | 明确边界：没有做磁盘加密/列加密，报告里不吹 |
| 强制存取控制（MAC） | PostgreSQL 没有标签式 MAC；本项目用 RLS + 角色替代 | — | 说明“为什么不用 MAC”，而不是假装实现 |
| 统计推断 | 教师视图只给聚合；不提供个人明细 | — | 聚合视图 + 最小分组思想（演示数据量下未做 k-匿名） |

---

## 第 5 章 数据库完整性

| 课堂知识点 | 我们的实现 | 现场演示 | 比课堂多走的一步 |
|---|---|---|---|
| 实体完整性 | 全部表有主键；关联表用复合主键 | `npm run demo:integrity`（`23505`） | 违约时能报出具体约束名 |
| 参照完整性 | 92 个外键；CASCADE / RESTRICT / SET NULL / NO ACTION 四种策略按语义选 | `npm run demo:integrity`（`23503`） | 复合外键保证冗余列与会话一致 |
| 用户定义完整性 | 11 个具名 CHECK、NOT NULL、UNIQUE | `npm run demo:integrity`（`23511`/`23502`） | 约束名统一 `<table>_<column>_ck`，报错可读 |
| 完整性约束命名 | 迁移里显式命名，数据字典可查 | `npm run docs:dictionary` | 约束目录由数据库反向生成，不会与文档漂移 |
| 触发器 | 9 个：先修防环、共学名额、本命花归属、3 个审计、3 个增量统计 | `npm run demo:integrity` | 行级 + 约束触发器 + 延迟检查都用上了 |
| 违约处理 | 事务内故意违约，打印 SQLSTATE 与约束名 | `npm run demo:integrity`（9/9 被拒） | 违约演示全部回滚，不留脏数据 |
| 完整性检查与性能 | 部分索引、`NOT VALID` + `VALIDATE CONSTRAINT` | `npm run lab:online-ddl` | 加约束不锁全表，5 万行实测 |
| ASSERTION | PostgreSQL 无 `CREATE ASSERTION` | — | 用触发器/约束触发器表达跨表断言，报告里说明原因 |

---

## 第 6 章 关系数据理论

| 课堂知识点 | 我们的实现 | 现场演示 | 比课堂多走的一步 |
|---|---|---|---|
| 函数依赖、候选键 | 候选键从 `pg_index` 自动导出（48 张表、19 张有额外唯一键），再人工列非平凡 FD | `npm run docs:keys` | 键是自动生成的，不会和文档漂移 |
| 1NF / 2NF / 3NF / BCNF | 48 张表逐表定级：40 BCNF、4 2NF、4 1NF | `docs/schema/normalization-analysis.md` | 不是“都 BCNF”，而是每张非 BCNF 都给出 FD 与理由 |
| 无损连接、依赖保持 | `plants` / `concepts` / `learning_states` 的分解与 Chase 论证 | `docs/schema/wide-table-vs-decomposed.md` | 配了宽表反例与三类异常 |
| 4NF（多值依赖） | 别名与先修拆成两张表，避免两个独立 MVD | 同上 | 说明“为什么拆开就满足 4NF” |
| 反规范化 | 8 处受控冗余（`user_id`、`quote`、`stage_reason`），每处配外键或不变量 | `npm run verify:invariants`（15 项） | 冗余不是“懒得拆”，而是有补偿机制 |
| 范式与性能的取舍 | 同一查询走 `(user_id, concept_id, created_at)` 索引 vs 多一次 JOIN | `docs/features-explained.md` 第 18 条 | 用高频路径说明“为什么保留 1NF 的 messages” |

**30 秒讲法**：“我们 48 张表里 40 张是 BCNF；剩下 8 张不是做不到，而是把 `user_id` 或展示文案冗余进子表，换高频查询少一次 JOIN。每一处冗余都有复合外键或可执行不变量兜底，`verify:invariants` 15 项全过。”

## 第 7 章 数据库设计

| 课堂知识点 | 我们的实现 | 现场演示 | 比课堂多走的一步 |
|---|---|---|---|
| 设计步骤（需求→概念→逻辑→物理→实施） | 报告第 3 章 + `docs/database-design.md` | — | 每一步都有产物（E-R、模式、索引、迁移） |
| 数据字典 | 从 `information_schema` 反向生成 15 张表 / 337 列 | `npm run docs:dictionary` | 文档与数据库不会漂移 |
| E-R 模型（Chen 表示法） | 5 张图：实体矩形、属性椭圆、**主键下划线**、弱实体双线 | `docs/er/` | 用 Graphviz 脚本生成，避免大模型自由发挥 |
| 大模型画 E-R 的坑（PPT 第 15–19 页） | 不用模型直接出图：模型只给实体/联系，脚本负责标准画法 | `python docs/er/gen_er.py` | 这正好回应课件“大模型画的往往不是教材格式” |
| E-R 图 → 关系模式 | `src/db/schema.ts` + `drizzle/0000`–`0016` | `npm run db:migrate` | 迁移可重放，约束与触发器分文件 |
| 数据模型优化 | 规范化分析 + 两处受控冗余 + 宽表反例 | `docs/schema/wide-table-vs-decomposed.md` | 用函数依赖和无损连接论证，而不是“感觉 3NF” |
| 设计用户子模式 | 教师视图 + `kv_teacher` 角色 | `npm run demo:grants` | 子模式 = 视图 + 授权，二者一起讲 |
| 物理设计：B+ 树 / GIN / 部分索引 | 99 个索引；1 个 `pg_trgm` GIN；2 个部分索引 | `docs/sql/index-decisions.md` | 用 EXPLAIN 前后对比，还记录了被否决的负优化 |
| 聚簇 / HASH 存取 | 见 `docs/sql/physical-design.md`（若已生成） | `npm run bench:physical` | 用实测说明什么时候该聚簇、什么时候哈希更小 |
| 实施与维护 | 迁移、seed、`demo:reset`、夜间维护过程 | `npm run maintenance` | 维护也写进数据库，而不是只写脚本 |

---

## 第 8 章 数据库编程

| 课堂知识点 | 我们的实现 | 现场演示 | 比课堂多走的一步 |
|---|---|---|---|
| SQL 表达能力的限制 | 用递归 CTE、窗口函数、`generate_series` 补足 | `npm run plan`、`npm run report` | 复杂分析尽量留在数据库里做 |
| `WITH` / `WITH RECURSIVE` | `fn_plan_path`：先修闭包 + 拓扑排序；`fn_stage_at`：时态重放 | `npm run plan -- --handle demo --goal 贝叶斯公式` | 递归 + 加权排序 + 理由生成 |
| 过程化 SQL：块、变量、流程控制 | `fn_settle_attempt`、`fn_stats_*`、`fn_reconcile_class_stats` | `npm test -- tests/settle-function.test.ts` | 幂等、`FOR UPDATE`、异常回滚 |
| 游标（DECLARE / FETCH / CLOSE） | `kv_nightly_maintenance` 里显式游标遍历归档会话 | `npm run maintenance` | 游标 + 动态 SQL + 异常处理写在一个过程里 |
| 存储过程（CALL / INOUT） | `kv_nightly_maintenance(IN p_days, INOUT p_report)` | `npm run maintenance` | 过程返回结构化 JSON 报告 |
| 存储函数 | `fn_plan_path`、`fn_stage_at`、`fn_garden_at`、`fn_class_galaxy`、`fn_settle_attempt` | 见各项测试 | 读函数 + 写函数分开，写函数受 RLS 约束 |
| 动态 SQL（EXECUTE） | 过程内 `EXECUTE format('ANALYZE %I', t)`，表名来自固定白名单 | `npm run maintenance` | 动态 SQL 也做白名单与 `%I` 转义 |
| JDBC 编程 | Node `pg`：`Client`↔Connection、参数化 query↔PreparedStatement、`rows`↔ResultSet、`BEGIN/COMMIT`↔事务、`Pool`↔连接池 | `src/db/index.ts` | 对应关系写进报告，语言不同但模型一致 |

---

## 补充：动态 Web 编程

| 课堂知识点 | 我们的实现 | 说明 |
|---|---|---|
| HTTP / 服务端程序 | Next.js Route Handlers（`src/app/api/**`） | 与 WSGI/Flask 的 route→handler 模型一致 |
| 请求与响应 | `parseBody` + Zod 校验 + 统一 `{ok, data, error}` | 错误码可被前端统一处理 |
| 会话 | Cookie `kv_session`（httpOnly/sameSite）+ `auth_sessions` 表 | 会话状态在数据库，可吊销 |
| 连接池 | `pg.Pool`（max 10） | 请求级上下文 + 事务级 `SET LOCAL` |
| 三层架构 | 浏览器（React）/ Next 服务 / PostgreSQL（业务库 + 只读沙箱） | 模型、视图、数据分离 |
| Web 安全 | 参数化、RLS、CSRF（sameSite）、输入长度/类型校验 | 与第 1 章的安全性呼应 |

---

## 三分钟怎么讲（如果只给三分钟）

1. **安全性**（10 秒）：`kv_app` 角色 + 18 张表 RLS + 视图授权；现场跑 `npm run demo:grants`，看 12501。
2. **完整性**（10 秒）：`npm run demo:integrity`，9 种违约 9 个 SQLSTATE；说明触发器与延迟约束。
3. **编程与扩展 SQL**（60 秒）：`npm run maintenance`（存储过程 + 游标 + 动态 SQL），`npm run plan`（递归 CTE + 拓扑排序）。
1. **收尾**（20 秒）：`npm run security:audit` 与 `npm run verify:invariants` 全绿——所有结论都可执行复现。
