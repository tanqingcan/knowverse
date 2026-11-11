# 3 数据库设计

> 负责人：A。数字口径：2026-10-27 在本机 PostgreSQL 16.14 上实测（`npm run docs:dictionary`、`docs/sql/explain-results.md`）。
> 图：`docs/er/er-overview.png` + 4 张局部图；数据字典：`docs/schema/data-dictionary.md`；模式图：`docs/schema/schema-core.svg`。

## 3.1 概念模型

### 3.1.1 实体与联系

用教材 Chen 表示法绘制（实体=矩形、属性=椭圆、主键加下划线、弱实体双线、联系=菱形并标注 1/n/m）：

- 总览：`docs/er/er-overview.png`（只画实体与联系，属性见局部图）
- 局部图 1：身份、星球、花圃、植物与知识点（`er-1-world`）
- 局部图 2：会话、消息、资料版本与引用（`er-2-dialogue`）
- 局部图 3：题目、作答、证据与成长（`er-3-growth`）
- 局部图 4：班级、分享、小组与学习卡（`er-4-class`）

主要实体：用户、星球、花圃、学科、知识点、植物、学习目标、会话、消息、模型调用、资料、资料版本（弱）、资料片段（弱）、题目、题目版本（弱）、提示（弱）、作答、评价、学习证据、笔记、成长事件、班级、学习意愿、 学小组、贡献、学习卡、卡片版本（弱）。

### 3.1.2 三处关键的实体边界判断

| 判断 | 反例的问题 | 本设计的做法 |
|---|---|---|
| 知识点 ≠ 植物 | 把 `concept_name`、`species`、`stage` 放一张表：概念改名要动所有用户的行；课程目录无法在无人种花时存在 | `concepts`（ 享知识点）+ `plants`（某人的外观实例）+ `learning_states`（某人对某知识点的状态）三表分离 |
| 资料 ≠ 资料版本 ≠ 片段 | 引用只指向 `material`：新版本上传后旧回答的“第 7 页”指向新文件，页面对不上 | `materials`（身份）+ `material_versions`（不可变版本，弱实体）+ `material_chunks`（片段，弱实体）；引用只存 `chunk_id` |
| 题目 ≠ 题目版本 | 题干改一次，历史作答的“当时题目”就丢了 | `tasks`（身份、题型、学科）+ `task_versions`（不可变内容）+ `task_concepts` + `task_hints` |

### 3.1.3 概念模型与实现细节的边界

`audit_log`（审计）、`message_terms`（倒排索引）、`mv_class_stats`（物化视图）属于**实现细节**，不进入概念 E-R 图，只在关系模式与数据字典中出现。这样概念模型回答“业务世界有哪些事物”，实现层回答“为了性能与安全加了什么”。

## 3.2 关系模式

  **47 张普通表 + 1 张分区表**（`audit_log`，按月分区），420 个列（含分区子表）、92 个外键、44 个 CHECK。按域分组：

| 域 | 表 |
|---|---|
| 身份与世界 | users, auth_sessions, planets, gardens, subjects, concepts, concept_aliases, concept_prerequisites, learning_goals, goal_concepts, plants |
| 对话与历史 | conversations, messages, message_concepts, concept_suggestions, model_calls, message_citations |
| 资料 | materials, material_versions, material_chunks, material_concepts |
| 练习与成长 | tasks, task_versions, task_concepts, task_hints, attempts, hint_events, evaluations, notes, learning_evidence, learning_states, growth_events |
| 协作 | classes, class_members, sharing_preferences, learning_intents, study_groups, study_group_members, contributions, knowledge_cards, card_versions, card_sources, card_publications, outbox_events |
| 安全与运维 | audit_log（分区表） |

关键表的主键与外键（完整清单见数据字典）：

| 表 | 主键 | 关键外键 / 约束 |
|---|---|---|
| messages | id | `(conversation_id, user_id) → conversations(id, user_id)`（复合外键保证冗余列一致）；`(conversation_id, seq)` 唯一；`role='assistant' ⇔ reply_to_id IS NOT NULL` |
| planets | id | `natal_plant_id → plants(id)`，**DEFERRABLE INITIALLY DEFERRED**；延迟约束触发器校验“本命花属于本星球” |
| class_members | (class_id, user_id) | `role ∈ {teacher, student}`；sharing_preferences / learning_intents 以复合外键引用它 |
| attempts | id | `(user_id, submit_key)` 唯一；`evaluations.attempt_id` 唯一 |
| learning_evidence | id | `(attempt_id, concept_id, kind)` 部分唯一；`revoked_at` 与 `revoke_reason` 同时为空或同时非空 |

## 3.3 函数依赖与规范化

### 3.3.1 以 `plants` 为例

```
候选键：(garden_id, concept_id)
函数依赖：
  (garden_id, concept_id) → species, color, lon, lat, nickname   （完全依赖）
  concept_id → name, subject_id                                    （若合并进宽表，则部分依赖）
```

把 `concept_id → name` 留在 `concepts` 后，`plants` 的所有非主属性都完全依赖候选键，达到 **BCNF**；`concepts` 以 `id` 为键，`name` 受 `(subject_id, name_norm)` 唯一约束保护，同样为 BCNF。`learning_states` 以 `(user_id, concept_id)` 为键，但 `stage → stage_reason`（理由文案是阶段的固定模板）构成传递依赖，严格判定为 **2NF**；这是为档案页直接展示理由而保留的展示冗余。

**无损连接**：分解的公 属性 `concept_id` 是 `concepts` 的键，按 Chase 算法可无损连接回原关系；`plants` 与 `learning_states` 通过 `(user_id, concept_id)` 关联，语义完整。

完整论证（含宽表反例、三类异常、依赖保持）见 `docs/schema/wide-table-vs-decomposed.md`；全库逐表定级见 `docs/schema/normalization-analysis.md`。

### 3.3.2 有意的受控冗余（全库  8 处）

| 冗余 | 违反的范式 | 为什么保留 | 一致性保障 |
|---|---|---|---|
| `messages.user_id` | 1NF（`conversation_id → user_id` 部分依赖） | 历史检索三路候选都按 user_id 过滤，省一次 JOIN | 复合外键 `(conversation_id, user_id) → conversations(id, user_id)` |
| `concept_suggestions.user_id` | 1NF（`message_id → user_id`） | 建议列表直接按用户过滤 | 外键 + 写入路径固定 |
| `learning_evidence.user_id` | 1NF（条件键下 `attempt_id → user_id`） | 档案页按 `(user_id, concept_id, created_at)` 直接查证据 | 不变量 E4 |
| `message_citations.quote` | 1NF（`chunk_id → quote` 部分依赖） | 引用快照可离线渲染、可审计 | 片段不可变（版本化） |
| `learning_states.stage_reason` | 2NF（`stage → stage_reason` 传递） | 档案页直接显示“为什么是这个阶段” | 规则收敛在 `computeStage` / `fn_settle_attempt` |
| `notes.user_id` | 2NF（`source_message_id → user_id`） | 笔记列表按用户过滤 | 不变量 E12 |
| `attempts.user_id` | 2NF（`conversation_id → user_id`） | 幂等键 `(user_id, submit_key)` 与权限过滤 | 条件唯一索引 + 外键 |
| `growth_events.user_id` | 2NF（`evidence_id → user_id`） | 时间轴按用户倒序 | 不变量 E13 |

结论：**先满足 BCNF，再为高频读路径保留可证明一致的冗余**；冗余必须有外键、事务或不变量兜底。

### 3.3.3 设计层面的取舍

- 枚举统一用 `text + CHECK` 而不是 PostgreSQL `ENUM`：新增取值不需要 `ALTER TYPE`，迁移简单、报告里容易解释；
- `jsonb` 只出现在 4 个与关系查询无关的位置（判题规格、评分维度、模型调用轨迹、outbox 载荷），不参与连接与约束；
- 版本化对象（资料、题目、学习卡）一律“身份表 + 不可变版本表”，引用绑定版本，不绑定身份。

### 3.3.4 全库范式分布

48 个关系模式逐表定级（44 张业务表 + 分区审计表 + 班级统计表 + 两张 CDC 表）：

| 最高范式 | 数量 | 表 |
|---|---|---|
| **BCNF** | 40 | users、auth_sessions、classes、class_members、sharing_preferences、cdc_consumed、cdc_offsets、audit_log、subjects、concepts、concept_aliases、concept_prerequisites、planets、gardens、plants、learning_goals、goal_concepts、conversations、message_concepts、model_calls、materials、material_versions、material_chunks、material_concepts、tasks、task_versions、task_concepts、task_hints、hint_events、evaluations、knowledge_cards、card_versions、card_sources、card_publications、learning_intents、study_groups、study_group_members、contributions、outbox_events、class_stats |
| **2NF** | 4 | learning_states、notes、attempts、growth_events |
| **1NF** | 4 | messages、concept_suggestions、message_citations、learning_evidence |

`class_stats` 形式上是 BCNF，但属性是其他表的派生聚合（触发器增量维护 + 对账函数修复），属于“派生汇总”；`mv_class_stats` 是物化视图，不参与范式统计。

**4NF / 5NF**：别名与先修是两组独立多值事实，已拆成 `concept_aliases` 与 `concept_prerequisites`，不存在非平凡多值依赖；没有必须三元分解才无损的关系，不涉及 5NF。

候选键由 `npm run docs:keys` 从 `pg_index` 自动导出（48 张表、19 张有额外唯一键）；函数依赖、逐表论证、补偿机制与改进清单见 `docs/schema/normalization-analysis.md`。

## 3.4 完整性约束

| 类别 | 数量 / 位置 | 说明 |
|---|---|---|
| 外键 | 91 | 37 CASCADE（随账户删除）、30 RESTRICT（ 享数据不可删）、20 SET NULL（软引用）、4 NO ACTION |
| CHECK | 41 | 枚举值域、状态互斥、数值范围、时间先后来后 |
| 唯一约束 / 唯一索引 | 50 主键 + 多个唯一索引 | 幂等键、题目版本号、片段序号、班级邀请码等 |
| 触发器 | 6 | 本命花归属（约束触发器）、先修防环（递归 CTE）、 学名额（`FOR UPDATE` 计数）、3 个审计触发器 |
| 复合外键 | 5 组 | `(conversation_id, user_id)`、`(class_id, user_id)`、`(group_id, user_id)` 等，用数据库保证冗余列与父表一致 |
| 延迟约束 | 1 组 | 星球与本命花互相引用：`DEFERRABLE INITIALLY DEFERRED` + 延迟约束触发器 |

> 说明：`information_schema.table_constraints` 会把 NOT NULL 也列成 CHECK（本机实测 312 条），其中真正的业务 CHECK 是 **41** 条；报告中一律用 `pg_constraint` 的口径。

## 3.5 索引与查询优化

实测索引 99 个（不含 `audit_log` 的 4 个）：95 个 B 树 + 4 个 GIN（`pg_trgm`）。核心查询与索引的对应关系见 `docs/database-design.md` §5。

**本次新增的两个部分索引**：

| 索引 | 场景 | 实测收益 |
|---|---|---|
| `messages_pending_idx (created_at) WHERE status='pending'` | 打开会话时把超时未完成的 pending 标记为中断 | 5.32 ms → **0.017 ms**（4 万条消息，pending 仅 60 条） |
| `learning_states_bud_due_idx (user_id, review_due_at) WHERE stage='bud'` | 待验证/待复习清单 | 小表下规划器仍走全表扫描（0.016 ms），索引为数据量增长预留 |

**一次被否决的负优化**：曾尝试覆盖索引 `messages (user_id, created_at DESC) INCLUDE (conversation_id, role, status)`，结果“两字中文关键词”检索从 88.6 ms 退化到 1412.5 ms——规划器改用该索引有序扫描并逐行回表取 `content`。收益为零、代价明显，已删除。完整数据与执行计划见 `docs/sql/index-decisions.md`。

**仍然存在的限制**：中文两字词短于 trigram（`show_trgm('条件概率')` 有 5 个三元组，`索引` 只有 1 个），无法使用 GIN trgm；当前在本人的消息范围内扫描（约 75 ms / 4 万条），后续由 C3 的二元组倒排表解决。

## 3.6 权限与安全

权限不只写在应用 SQL 里，而是下沉到数据库（对应课程“数据库安全性”一章）：

- **角色**：运行时用 `kv_app`（`NOSUPERUSER`、`NOBYPASSRLS`、无 DDL，只有 CONNECT + DML + 序列）；迁移与种子用表所有者；SQL 练习用独立的 `kv_sandbox`（只读事务 + 2s 语句超时 + 业务库撤销 CONNECT）。
- **行级安全（RLS）**：18 张表启用策略（17 张个人数据表 + 审计表），策略统一读会话变量 `app.user_id`，未设置时返回 0 行。
- **请求级上下文**：`authed()` 把用户放进 `AsyncLocalStorage`，`q()` / `withTx()` 在事务内 `set_config('app.user_id', …, true)`，连接归还池后自动清除。
- **跨用户读只走函数**：班级星系用 `fn_class_galaxy(p_user, p_class)`（`SECURITY DEFINER` + 固定 `search_path`），函数内校验成员资格与分享开关；调用者拿不到未分享成员的数据。
- **纵深防御**：应用层仍保留 `user_id` 条件；数据库再兜一层，漏写条件也只能看到 0 行。

验证：`tests/security.test.ts`（8 例）与 `tests/galaxy-view.test.ts`（3 例），现场演示脚本 `docs/sql/rls.md`。

## 3.7 事务与并发

| 场景 | 方案 |
|---|---|
| 对话生成 | 两阶段事务：事务 1 存用户消息 + pending 占位；模型调用在事务外；事务 2 写回答、引用、标签与证据。超时 pending 在打开会话时标记为“可安全重试” |
| 重试 | 只有 `failed` 能被认领为 `pending`（`UPDATE … WHERE status='failed'`），并发重试只有一个成功 |
| 作答结算 | `fn_settle_attempt`：`FOR UPDATE` 锁作答 → 幂等复查 → 写评价/证据/阶段/成长事件/outbox，全部原子；`(user_id, submit_key)` 唯一索引兜底并发 |
|  学名额 | BEFORE INSERT 触发器锁小组行后计数，6 个并发请求争 1 个名额时恰好 1 个成功 |
| 事件投递 | 事务性 outbox：业务事务内写入，事务外 `FOR UPDATE SKIP LOCKED` 投递 |

并发与回滚均有测试：并发重复提交只产生一条评价、注入故障后整笔回滚且可安全重试（`tests/practice-growth.test.ts`、`tests/settle-function.test.ts`）。

## 3.8 视图、物化视图与分区

| 对象 | 用途 | 关键设计 |
|---|---|---|
| `v_material_citation` | 消息 → 片段 → 版本 → 资料的引用定位 | `security_invoker = true`，继承查询者 RLS |
| `mv_class_stats` | 班级成员数 / 公开星球数 / 最近活跃 | 唯一索引 + `REFRESH … CONCURRENTLY`（`npm run stats:refresh`） |
| `audit_log` | 敏感表变更审计 | `PARTITION BY RANGE (at)`，按月分区 + DEFAULT 分区兜底；`EXPLAIN` 可见分区裁剪；维护脚本 `npm run audit:partitions` 提前补建未来月份 |

分区裁剪实测：查 2026-11 的审计只扫描 `audit_log_2026_11`；超出已建范围的记录落 `audit_log_default`（`tests/audit.test.ts`）。

## 3.9 模式的演进

迁移按能力分批，每次都可回滚重放（`npm run db:reset`）：

| 迁移 | 内容 |
|---|---|
| 0000 | drizzle-kit 生成的 44 张基础表与索引 |
| 0001 | 手写约束与触发器（DEFERRABLE 环形引用、先修防环、名额兜底、消息角色 CHECK） |
| 0014 | 行级安全（18 张表、策略、`kv_current_user_id()`） |
| 0015 | 视图、物化视图、`fn_class_galaxy` |
| 0016 | `fn_settle_attempt` 结算函数 |
| 0017 | `audit_log` 分区表 + 3 个审计触发器 |
| 0018 | 部分索引（pending 消息、待验证状态） |

新增的表与对象都没有改变概念模型：RLS 是权限、视图是投影、函数是过程、分区是存储、审计是实现——这正好回答“为什么代码里有 45 张表，E-R 图只有 27 个实体”。

## 3.10 时态查询：按证据有效期重放

成长时间轴需要回答“某一时刻这株花是什么阶段”。我们没有加快照表，而是把证据看作**带有效期的区间**：

```
证据 e 在时刻 t 有效  ⇔  e.created_at ≤ t  且  (e.revoked_at IS NULL 或 e.revoked_at > t)
```

- `fn_stage_at(user, concept, t)`：按该时刻的有效证据集合重算阶段；
- `fn_garden_at(user, t)`：返回该时刻整个花园的快照（每株花的“当时阶段”与“当前阶段”）；
- 接口：`GET /api/timeline/asof?at=…`；
- 性质：纯读、幂等；撤销证据只改一行 `revoked_at`，历史自动重算；`as-of(now)` 必须等于 `learning_states.stage`（种子数据全量核对，漂移为 0）。

这体现了“事实（证据）与投影（当前状态）”的分离：`learning_states` 是为读性能保留的物化结果，时间机器证明它可以被证据完整重建。详见 `docs/sql/time-machine.md`。

## 3.11 并发与不变量：可执行的证据

| 能力 | 做法 | 结果 |
|---|---|---|
| 并发异常实证 | 两个真实连接按固定交错复现丢失更新、不可重复读、幻读、写偏移 | 9/9 符合隔离级别语义（`docs/sql/isolation-lab.md`） |
| 数据库不变量自检 | 12 条 SQL（阶段漂移、评价一一对应、证据可溯源、受控冗余、本命花归属、RLS 覆盖…） | `npm run verify:invariants`，error 级为 0 才通过 |
| 随机负载 fuzz | 固定种子随机执行写证据/撤销/作答/建班，每 8 步跑一次不变量 | 24 步后仍为 0 违规（`tests/invariants.test.ts`） |

这三件事把“数据库设计正确”从**论文里的论证**变成**可重复执行的检查**：阶段漂移会被 E1 抓出来，忘了给新表加 RLS 会被 E10 抓出来，隔离级别的行为被脚本钉死，改坏了 CI 会红。

## 3.12 增量维护、CDC 与在线 DDL

**增量维护**：班级统计不再每次都 `REFRESH` 物化视图，而是用触发器做增量（`member_count ± 1`、`share_planet` 真假变化才 `± 1`、活跃时间取 max），并配一张 `class_stats` 表和两个兜底：

- `v_class_stats_drift`：增量值与真实聚合的差异，非空即漂移；
- `fn_reconcile_class_stats()`：按真实聚合修复，幂等，返回修复行数。

不变量 `E11` 上线后**连续抓到两个真实 bug**：① 用户加入班级前已有的活跃记录没有回填；② 撤销证据导致活跃时间回退时触发器只处理“变大”。修复分别落在 `0022`、`0023`。这说明增量维护不是“写完就信”，而是“写完必须对账”。

**CDC**：outbox 之前只有写入、没有消费者（`W1` 长期报警）。用逻辑复制槽 + `test_decoding` 从 WAL 解码 `outbox_events` 的 INSERT，消费者按事件 id 幂等落库、记录已消费 LSN：

- 语义：**至少一次投递 + 幂等 = 效果上的恰好一次**；
- 监控：每轮打印 `pg_wal_lsn_diff(now, confirmed_flush_lsn)`，积压意味着消费者落后、WAL 被保留；
- 前置：`wal_level = logical`（本机已改配置并重启；Docker 环境用 `-c wal_level=logical`）。

**在线 DDL**：对 5 万行的表做结构变更，同时有并发写入，实测：

| 操作 | 结果 |
|---|---|
| 普通 `CREATE INDEX`（另一长事务持锁） | 被 `lock_timeout` 拒绝，错误码 `55P03` |
| `CREATE INDEX CONCURRENTLY` | 32 ms 完成，期间写入 74 次、最大延迟 2 ms |
| 加列 + 分批回填（26 批，`SKIP LOCKED`） | 单批最长 16 ms，写入最大延迟 12 ms |
| `ADD CONSTRAINT … NOT VALID` + `VALIDATE` | 1 ms 加约束、6 ms 校验，不阻塞写入 |

详见 `docs/sql/time-machine.md`、`docs/sql/isolation-lab.md`、`docs/sql/incremental-stats.md`、`docs/sql/cdc.md`、`docs/sql/online-ddl.md`。

## 3.13 扩展 SQL 的两个应用

**学习路线规划 `fn_plan_path`**：递归 CTE 求目标知识点的先修闭包 → 按“到目标的距离”倒序（拓扑序，保证先修在后继之前）→ 同层按阶段与真实错题数加权，返回每一步及其理由。示例（demo → 贝叶斯公式）：

| 顺序 | 知识点 | 阶段 | 理由 |
|---|---|---|---|
| 1 | 样本空间与事件 | 种子 | 目标「贝叶斯公式」的先修 |
| 2 | 条件概率 | 开花 | 已开花：可跳过或用来巩固 |
| 3 | 乘法公式 | 种子 | 目标「贝叶斯公式」的先修 |
| 4 | 全概率公式 | 花苞 | 有 1 次错题，建议优先补 |
| 5 | 贝叶斯公式 | 花苞 | 目标知识点 |

**学习周报**：六种扩展 SQL 写法——`generate_series` 补零、多源 `UNION`、`FILTER` 漏斗、`GROUPING SETS`（学科小计 + 合计）、`percent_rank()` 班级百分位、gaps-and-islands 连续学习天数。

界面入口：顶栏「成长」→「学习路线」/「学习周报」（手机端在底部导航）。路线面板可选目标、查看每一步的理由、一键去练习；周报面板可切换 7/30 天，并展开「这六块数字背后的 SQL」。
也可以命令行演示：`npm run plan -- --handle demo --goal 贝叶斯公式`、`npm run report -- --handle demo`。
截图：`docs/screenshots/ui/ui-14-plan.png`、`ui-15-report.png`、`ui-16-report-sql.png`、`ui-17-mobile-plan.png`。课堂映射与逐条讲法见 `docs/defense-guide.md`。

## 3.14 SQL 注入防护与安全自查

全部 SQL 使用 `$1..$n` 占位符；`LIKE` 的 `%`、`_` 通过 `escapeLike` 显式转义。为证明不是“口头参数化”，我们用 6 组经典 payload 打自己的查询函数：

| 用例 | 结果 |
|---|---|
| 搜 `%` / `_` | 0 条（通配符被转义，不会匹配全部） |
| 搜 `' OR 1=1 --` | 0 条，不报错、不越权 |
| 搜 `'; DROP TABLE messages; --`、`'; TRUNCATE …` | 只当普通文本；`messages` 表仍在、行数不变 |
| 把注入串写进笔记 | 按字面量保存，用户表未被改写 |
| 用注入串注册 | 被 handle 校验拒绝（`bad_handle`） |
| 超长关键词 | 被 Zod 上限拒绝 |

另有一套 6 项安全自查 `npm run security:audit`，全部通过：

| 编号 | 检查 |
|---|---|
| S1 | 运行时角色 `kv_app` 非超级用户、不能绕过 RLS |
| S2 | 带 `user_id` 的表都启用行级安全（例外已登记） |
| S3 | 只读沙箱角色连接业务库被拒绝 |
| S4 | 口令只存 `scrypt$` 哈希 |
| S5 | `.env` 未被版本库跟踪 |
| S6 | SQL 模板插值位置清单（4 处：常量片段 + SQL 练习沙箱，均为设计允许） |

对应测试：`tests/injection.test.ts`（6 例）。这条能力回答的是“为什么不做攻击、做防御”：注入防护与权限隔离是**可验证**的，而不是靠声明。

## 3.15 批处理与存储过程性能

同一台机器、同一连接，实测“逐行 vs 集合”的量级差：

| 场景 | 应用逐条/逐次 | 数据库内逐行 | 集合/单次 |
|---|---|---|---|
| 插入 5000 行 | 1473 ms | — | **21 ms**（约 70×） |
| 更新 5000 行 | 4885 ms | 133 ms（PL/pgSQL 游标） | **59 ms**（合计约 83×） |
| 点查 3000 次 | 561 ms | — | **6 ms**（约 94×） |

结论：**主要成本是往返次数**。把循环搬进 PL/pgSQL 省掉网络往返（约 37×），再把逐行执行换成一条集合 UPDATE 又省掉 N 次执行计划（约 2.3×）。这也是本项目把「作答结算」「班级统计」「学习周报」写成 SQL/存储过程而不是应用循环的原因；而需要调用模型、解析文件的步骤仍留在应用层，只在事务边界上保证一致。

命令：`npm run bench:batch -- --rows 50000`；完整表格与结论见 `docs/sql/batch-performance.md`。

## 3.16 按课程章节补齐的实现（第 4/5/7/8 章）

| 课程章节 | 新增实现 | 现场命令 |
|---|---|---|
| 第 4 章 视图机制 / 授权 | 教师子模式 `v_teacher_class_overview`、`v_teacher_concept_heat`；`kv_teacher` 只被授予视图；演示 GRANT/REVOKE、WITH GRANT OPTION、列级授权 | `npm run demo:grants` |
| 第 5 章 违约处理 | 9 种完整性违约各触发一次，打印 SQLSTATE 与约束名（主键、外键、RESTRICT、CHECK、NOT NULL、唯一、触发器、延迟约束、名额） | `npm run demo:integrity` |
| 第 7 章 物理设计 | B+ 树 / HASH / 聚簇（CLUSTER）实测：范围查询 shared hit 21 → 2；低基数列上 B 树因去重反而更小 | `npm run bench:physical` |
| 第 8 章 存储过程 / 游标 / 动态 SQL | `PROCEDURE kv_nightly_maintenance(IN p_days, INOUT p_report)`：显式游标、`EXECUTE format('ANALYZE %I')` 白名单、异常写入报告 | `npm run maintenance` |

课程知识点与实现位置的完整对照见 `docs/course-mapping.md`。
