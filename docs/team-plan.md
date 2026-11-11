# 知屿 KNOWVERSE · 第二阶段开发计划（定稿 v1.0）

> 项目：《数据库系统概论》大作业 · 个人学习智能体（B/S 架构，Next.js 15 + PostgreSQL 16）
> 团队：4 人（A = 组长 / B / C / D）
> 版本：v1.0（2026-10-27）· 本文件是分工与协作的唯一依据，任务卡编号即 Issue 标题
> 阅读顺序：§1 现状 → §2 目标 → §3 分工总表 → §5 任务卡（找到自己）→ §7 协作规范 → §9 排期

---

## 1. 现在是什么状态

### 1.1 一句话

已有一个可运行的个人学习助手：每个用户一颗星球，学科是花圃、知识点是植物；向导「星灯」结合目标、近期对话与资料回答问题并给出引用；历史问答可按关键词/日期/知识点检索并定位原消息；植物只依据真实学习证据成长。

### 1.2 实测基线（2026-10-27 复核，不是文档抄的）

| 项 | 数值 |
|---|---|
| 表 / 索引 / 外键 / CHECK / 触发器 / 函数 | 44 普通表 + 1 分区表（audit_log）/ 99 / 91 / **41** / 6 / 38 |
| 扩展 | `pg_trgm 1.6`；**无 pgvector**（本机构建只带 99 个 contrib） |
| 视图 / 物化视图 / RLS / 业务角色 / 存储过程 / 分区 / 审计表 | **全部为 0** |
| seed 数据 | 3 用户、17 知识点、13 植物、6 会话、12 消息、5 资料/6 版本/28 片段、15 题、17 证据 |
| 测试 | `npm test` **47 个用例全绿**（真实 PostgreSQL） |
| 前端 | 3D 花园（React Three Fiber）+ SVG 降级；桌面/手机；键盘可达；低动效 |
| 演示模式 | `LLM_MODE=demo` 不调用模型，回答来自固定逻辑 + 真实检索，界面明确标注 |

### 1.3 已发现的待修问题

| 问题 | 影响 | 归属 |
|---|---|---|
| `npm test` 在新克隆上失败（`knowverse_test` 库不会自动创建） | 新人无法跑测试 | D2 |
| `storage/test-uploads/` 未进 `.gitignore`，测试会改写已提交的 fixture | 工作区变脏、PR 误带文件 | D2 |
| 客户端日期格式化硬编码 `Asia/Taipei`（`src/lib/api.ts`、`SpaceApp.tsx`） | 用户选其它时区后显示不一致 | B7 |
| 无 `favicon.ico` | 浏览器标签空白，投屏明显 | B7 |
| 温室屋顶玻璃 rotation 符号与木梁相反 | 放大可见玻璃翘出屋面 | B1 |
| 玫瑰花瓣 cup 过强、分段 6×9，近景折面与自穿插 | 答辩近景不够精致 | B1 |

---

## 2. 这一阶段要做什么

### 2.1 判断

作业要求的功能（个性化答疑、历史检索、资料整理、个性化训练、多表、B/S 界面）**已经全部覆盖**，继续加功能不加分。真正决定成绩的是三件事：

1. **数据库设计**（作业任务 1 占大头，且课堂要答辩）；
2. **报告与答辩**（四部分齐全、有实测数据、能讲清取舍）；
3. **现场演示的说服力**（比别人多出「看得见的数据库能力」）。

### 2.2 三条主线

| 主线 | 目标 | 量化验收 |
|---|---|---|
| 数据库深度 | 把课堂内容真正用上：RLS/角色、视图、物化视图、PL/pgSQL、触发器、分区、倒排索引、索引优化、EXPLAIN | 新增迁移 ≥6 个；视图 ≥3；存储过程 ≥2；分区表 1；审计覆盖 3 张敏感表；检索 P95 有前后对比 |
| Agent 深度 | RAG（倒排 + 重排 + 引用校验）、Memory（滚动摘要 + 长期记忆）、真实模型工具调用 | 真实模式完成 3 轮问答含工具与引用；50 条检索评测；记忆可演示、可撤销 |
| 表现与交付 | 建模精细化、星球自转、多球宇宙；CI、回归、文档、PPT | CI 全绿；12 条主流程回归通过；报告 ~50 页；8 分钟答辩 |

### 2.3 明确不做

微服务、向量数据库（无 pgvector，做对照实验即可）、一人一库/跨库联邦、给 `messages` 分区（4 处外键指向它，会断引用链）、为凑表数拆表、最后一周改数据模型。

---

## 3. 分工总表（四条竖线）

按业务纵向切，每人一条完整竖线，避免前后端互相等。

| 竖线 | 人 | 范围 | 答辩时他回答的问题 | 负载（半天） |
|---|---|---|---|---|
| **数据与身份** | **A（组长）** | 模式与迁移、权限、班级/身份后端、E-R 与数据字典、报告数据库章、代码评审 | 「这套模式凭什么成立？权限凭什么信数据库？」 | 18 |
| **检索与智能** | **C** | 对话智能体、RAG、Memory、历史检索、资料流水线、评测 | 「它为什么答得对、记得住？」 | 21 |
| **呈现与宇宙** | **B** | 全部 UI/3D、自转、多球宇宙、记忆界面、性能与可访问性 | 「第一眼的差异化怎么做的？」 | 17 |
| **集成与交付** | **D** | 判题沙箱、CI 与测试、端到端 QA、合并发布、报告总集、PPT 统筹 | 「整套东西真的能跑、能交吗？」 | 20 |

> 负载单位：1 = 半个工作日（3–4 小时有效投入）。按 6 周、每人每周约 3 个半天估算，人均容量 ≈ 18，C 略超，见 §8 对冲方案。

---

## 4. 模块所有权（谁能改哪些文件）

**规则：改到别人的目录，必须在该 PR 里 @ 对方 review；`drizzle/` 只有 A 能合并。**

| 目录 / 文件 | A | B | C | D |
|---|---|---|---|---|
| `drizzle/`、`src/db/` | ✅ 唯一合并人 | | 起草 SQL，由 A 合并 | |
| `src/server/{auth,http,errors,text,concepts,world,classes,growth}.ts` | ✅ | | | |
| `src/app/api/`（auth、me、classes、world、plants、concepts） | ✅ | | | |
| `src/server/{chat,history,materials}.ts`、`src/server/agent/`、`src/server/retrieval/`(新)、`src/server/search/`(新) | | | ✅ | |
| `src/app/api/`（chat、history、materials、agent、conversations、messages、notes） | | | ✅ | |
| `src/server/practice.ts`、`sandbox/`、判题与作答 API | | | | ✅ |
| `src/components/**`、`src/app/page.tsx`、`/space`、`/welcome`、`src/lib/api.ts` | | ✅ 唯一 | | |
| `docs/er/`、`docs/schema/`、`docs/sql/`、`docs/database-design.md` | ✅ | | | |
| `docs/screenshots/`、`docs/visual-redesign.md` | | ✅ | | |
| `docs/agent.md`、`docs/retrieval.md`、`docs/memory.md`、`docs/agent-eval.md` | | | ✅ | |
| `.github/`、`scripts/bench.ts`（数据生成 + 压测）、`tests/global-setup.ts`、`.gitignore` | | | `scripts/bench-search.ts`（检索评测） | ✅ |
| `tests/**`（security/history/growth/classes） | ✅ | | | |
| `tests/**`（chat/materials/retrieval/memory） | | | ✅ | |
| `tests/**`（practice/sandbox/e2e） | | | | ✅ |
| `docs/report.md`（主文档） | 数据库章 | 界面章 | 智能体章 | ✅ 总集 |
| 答辩 PPT | 数据库 2 页 | 版式 + 视觉 3 页 | 智能体 5 页 | ✅ 统筹 + 3 页 |

---

## 5. 任务卡

> 每张卡 = 一个 Issue = 一个 PR。`依赖` 为空表示可立即开工。
> 「验收证据」是要贴进 PR 或报告里的东西，没有证据不算完成。

### 5.1 A（组长）：数据与身份

#### A1 · 行级安全 + 应用角色 + 最小权限（3）
- **目标**：把「权限」从应用层 WHERE 下沉到数据库策略。PPT 备注原话：「检查用户权限可以用数据库」。
- **做法**：新建 `kv_app` 角色（非超级用户）；`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`；策略用 `user_id = current_setting('app.user_id')::uuid`；在 `src/db/index.ts` 增加 `withUser(userId, fn)`：`BEGIN` → `SET LOCAL app.user_id` → 执行 → `COMMIT`；视图统一加 `security_invoker = true`。
- **涉及**：`drizzle/0002_security.sql`(新)、`src/db/index.ts`、`src/server/auth.ts`、`scripts/migrate.ts`
- **验收**：① 全站以 `kv_app` 运行通过；② 换一个用户上下文直接 `SELECT * FROM messages` 返回 0 行；③ 越权 INSERT 被 `WITH CHECK` 拒绝；④ 新增 `tests/security.test.ts` ≥6 例；⑤ 原 47 例不回归。
- **证据**：两个 psql 会话的截图 + 测试输出。

#### A2 · 三张视图 + 班级星系 API + 物化视图（3）
- **目标**：把复杂查询下沉到数据库，同时给多球宇宙提供数据。
- **做法**：`v_class_galaxy`（班级成员星球摘要）、`v_student_growth`（用户×知识点阶段+证据数）、`v_material_citation`（消息→片段→版本→页码）；`mv_class_stats` + 唯一索引 + `REFRESH ... CONCURRENTLY`；`GET /api/classes/[id]/galaxy`；先写 `docs/api/galaxy.md` 契约给 B。
- **验收**：① 视图只返回 `share_planet = true` 的成员或本人；② `/galaxy` 返回成员阶段分布与最近活跃；③ `kv_teacher_ro` 只能读视图；④ 测试 3 例；⑤ **W2 结束前契约冻结**。
- **依赖**：A1（策略）

#### A3 · 存储过程结算 + 阶段重算（3）
- **目标**：把「作答结算」的原子性交给数据库。
- **做法**：`fn_settle_attempt(p_user, p_attempt, p_answer, p_submit_key)`：幂等检查 → 写 evaluations → 写 learning_evidence → 重算 learning_states → 写 growth_events → 写 outbox；`SECURITY DEFINER` + 固定 `search_path`；应用层只负责事务外的沙箱评价。
- **验收**：① 同一 `submit_key` 并发 10 次只结算 1 次；② 函数中途异常全回滚；③ 与现有 `submitAttemptSafe` 行为一致；④ 测试 6 例（幂等/并发/回滚/权限）。
- **依赖**：A1

#### A4 · 审计表（按月分区）+ 审计触发器（2）
- **目标**：触发器 + 分区的真实用途，且不碰 `messages` 的外键。
- **做法**：`audit_log(id, at, actor_user_id, table_name, op, old_row jsonb, new_row jsonb)` `PARTITION BY RANGE (at)`，建 2026-10/11/12 三个分区；`fn_audit_row()` 通用触发器；挂到 `sharing_preferences`、`class_members`、`learning_evidence`。
- **验收**：① `EXPLAIN` 可见只扫目标分区；② 改分享偏好/加班级成员/撤销证据各产生审计行；③ 写入性能无明显退化（对比 1000 次操作的耗时）。
- **依赖**：A1

#### A5 · E-R 定稿 + 数据字典 + 宽表对比（2）
- **目标**：让图与库严格一致，且符合教材写法。
- **现状更正**：`docs/er/gen_er.py` **已经支持**主键下划线（属性名加 `*` 前缀渲染为 `<U>`）与弱实体双线，无需新增功能，改为**核对**：确认每张局部图的主键都带 `*`、弱实体用 `~` 部分码。
- **做法**：重新生成 5 张图；`scripts/docs-dictionary.ts` 从 `information_schema` 生成 `docs/schema/data-dictionary.md`；`docs/schema/wide-table-vs-decomposed.md` 写清宽表反例、函数依赖、无损连接与两处受控冗余；`npm run docs:diagrams` 改为跨平台（python3 / python 自动选择）。
- **验收**：① 5 张图重新生成且主键下划线可见；② 字典与库 diff 为空（重跑脚本内容不变）；③ 图注说明「`audit_log`/`message_terms` 是实现细节，不入概念模型」。

#### A6 · 索引设计与迁移（2）
- **做法**：`messages(status) WHERE status='pending'` 部分索引；历史检索覆盖索引 `(user_id, created_at DESC) INCLUDE (conversation_id, role)`；与 D 的 bench 数据联动出前后 P95。
- **验收**：① 4 万条数据下历史检索 P95 < 50ms；② before/after 执行计划进 `docs/sql/explain-results.md`；③ 迁移可重复执行。
- **依赖**：D2（bench 脚本）

#### A7 · 报告数据库章 + 大模型辅助记录（3）
- **内容**：报告第 3 章（数据库设计）+ 第 8 章（大模型辅助设计记录）；附录（E-R 全图、数据字典、核心 SQL、EXPLAIN）。
- **要点**：函数依赖与候选键、BCNF 论证、两处受控冗余的维护方式、完整性约束清单、索引与权限设计、事务与并发策略；第 8 章补齐「团队审阅意见 + 合理性与规范程度分析」（作业明文要求）。
- **验收**：① 数字与实测一致；② 术语与 D 的术语表一致；③ 团队审阅表由三人签字（填写）。

### 5.2 B：呈现与宇宙

#### B1 · 建模修复与精细化（3）
- **做法**：玫瑰 `cup`/`curl` 重调、`segU` 6→10；花苞造型重做（不再是尖刺）；温室屋顶玻璃 rotation 符号修正（`Props3D.tsx` 中 `-π/2 - sd*roofAng` 与木梁 `+sd*roofAng` 相反，且有遗留的 `+ (sd > 0 ? 0 : 0)`）；旅人坐姿穿模；草丛由低分段圆锥改圆润曲面。
- **验收**：① `/dev/flowers` 与 `/dev/garden` 三倍像素截图前后对比入库；② 无 z-fighting、无明显穿模；③ 软件渲染帧率不下降。
- **证据**：`docs/screenshots/ui/` 新增 8 张对比图。

#### B2 · 星球自转 + 镜头手感（2）
- **做法**：`GardenWorld.tsx` 的 `Rig` 中，空闲时 `world.rotation.y += 0.03 * dt`；`pointerdown` 立即接管，松手 3 秒后恢复；`reduced-motion` 时禁用；与现有拖拽限位（±0.6 rad）合并。
- **验收**：① 自转平滑无跳变；② 拖拽仍受限；③ 低动效静止；④ 入场动画不冲突。

#### B3 · 多球宇宙 v1（4）
- **做法**：`world/GalaxyScene.tsx`；消费 A2 的 `/galaxy` 契约；班级成员各一颗低模星球环绕恒星；点击进入「只读星球」并可返回；无 WebGL 时 2D 星图降级；键盘可遍历。
- **验收**：① 3 个成员显示 3 颗星球，未分享者不出现；② 进入后看到对方花圃但无编辑入口；③ 移动端可用；④ 有 GPU 时 60fps、软件渲染 ≥12fps。
- **依赖**：A2

#### B4 · 记忆与引用界面（2）
- **做法**：记忆面板（列表、来源消息跳转、删除/修正）；回答中的引用高亮 + 「为什么引用这段」浮层。
- **验收**：① 记忆可删可回溯到原消息；② 引用可点击定位到资料版本与页码；③ 空态与错误态齐全。
- **依赖**：C5

#### B5 · 视觉性能预算与降级（2）
- **做法**：统计花园/宇宙场景的 draw call 与三角面，写预算表；自适应 `dpr`；远处星球 LOD；低端机自动切静态绘本。
- **验收**：① 预算表入 `docs/visual-redesign.md`；② 连续 60 秒无内存增长；③ 切换降级不闪屏。

#### B6 · 截图与答辩视觉页（2）
- **验收**：① 桌面 1440×900、手机 390×844、静态降级、低动效四组截图全部重拍；② 答辩用 4 页视觉图（风格、建模、宇宙、降级）。

#### B7 · 响应式与可访问性回归 + 小缺陷（1）
- **内容**：1440/768/390 三档无溢出；焦点态、对比度、键盘路径清单；顺带修两个已知缺陷：日期硬编码 `Asia/Taipei`、缺 favicon。
- **验收**：① 三档截图；② 键盘 Tab 走完主流程；③ 两个缺陷修复有提交。

#### B8 · 报告界面章（1）
- **内容**：第 4 章“界面与可视化”部分 + 截图编号；第 2 章提供架构图素材。
- **验收**：字数与图号符合 D 的模板。

### 5.3 C：检索与智能

#### C1 · 真实模型闭环 + 工具调用 + 评测集（3）
- **做法**：`LLM_MODE=live` 打通 OpenAI 兼容接口（建议 DeepSeek：`https://api.deepseek.com/v1` + `deepseek-chat`）；提示词版本化；结构化输出校验；超时/非法输出/重试；`docs/agent-eval.md` 记录 10 条问题与期望要点。
- **验收**：① 完成 3 轮问答，至少 1 次工具调用、1 处资料引用；② 失败路径有测试；③ 评测集 10 条有通过率；④ README 限制章节更新。

#### C2 · 资料流水线补完（3）
- **做法**：Word/Excel 保存元数据并标「未提取」；PPT 读取备注页；扫描件 OCR 提示；分块按标题层级 + 页码 + 重叠；大文件与伪造扩展名拦截。
- **验收**：① 4 类文件各 1 个测试；② 引用能定位到页码/段落；③ 失败状态（needs_ocr/unsupported/failed）可区分。

#### C3 · 倒排检索：`message_terms`（5）
- **目标**：解决 README 已知限制「两个字的中文关键词无法使用 trigram 索引」。
- **做法**：新表 `message_terms(term, message_id, weight)`，中文按二元组切分；`term` 建 btree + `pg_trgm`；检索改为「倒排 ∪ ILIKE ∪ 知识点」的候选集 + 融合打分 + 去重；复用 D2 的 `scripts/bench.ts` 数据集，另写 `scripts/bench-search.ts` 跑 50 条查询对比。
- **验收**：① 两字关键词能命中且 `EXPLAIN` 用上索引；② 50 条评测查询命中率对比写入 `docs/sql/search-eval.md`；③ 原 history 测试全绿；④ 与 A6 共用同一份 bench 数据。
- **依赖**：A6（索引迁移顺序）

#### C4 · RAG 重排 + 引用校验（4）
- **做法**：召回后按知识点匹配度、版本新旧、命中位置、相邻片段合并重排；引用必须真实存在，统计「引用覆盖率」与「无依据率」；**可选对照**：`chunk_embeddings(real[])` + SQL 余弦，`EXPLAIN` 展示全表扫描，论证生产需要 pgvector/HNSW（本机无该扩展，不引入依赖）。
- **验收**：① 50 条问题的引用准确率有前后对比；② 无依据回答会被标注「资料不足」；③ 向量对照实验有执行计划与结论（可仅写文档）。

#### C5 · 记忆系统（4）
- **做法**：短期 `conversation_summaries(conversation_id PK, upto_seq, summary, model_call_id)`，每 6 轮或超长时重写；长期 `user_memories(kind, content, concept_id, source_message_id, confidence, importance, expires_at, revoked_at, revoke_reason)`；新工具 `propose_memory`（模型只提议）；后端规则去重/合并/TTL；读取按知识点/新近度/重要度取 Top-K 并限制 token；记忆面板 API。
- **验收**：① 说「我一直搞不懂 LEFT JOIN」后新会话能主动提起；② 记忆可在面板删除且不再注入；③ 去重与过期有测试；④ 写入必须带来源消息，可溯源。
- **依赖**：C1（模型提议）、A1（RLS 对新表生效）

#### C6 · 智能体章节 + 检索/记忆文档（2）
- **内容**：报告第 4 章智能体与检索部分；`docs/retrieval.md`、`docs/memory.md`、`docs/agent-eval.md` 定稿。
- **验收**：与 D 的模板一致，图表编号连续。

### 5.4 D：集成与交付

#### D1 · 判题沙箱安全 + 结果等价判定（4）
- **做法**：在现有只读角色 + `statement_timeout` 基础上，增加语句白名单/黑名单（拒绝 DDL/DML/系统表/`pg_sleep`/多语句）；结果行数与返回体大小上限；结果集**无序对比**、NULL 三值语义、浮点容差、列名不敏感。
- **验收**：① 现场演示 `DROP TABLE school_v1.students` 被拒；② 8 例安全测试 + 4 例等价测试；③ 错误信息对学生友好；④ 不影响正常判题。
- **证据**：录屏或截图 + `docs/sql/sandbox.md`。

#### D2 · CI + 测试基建 + 新克隆可用性（3）
- **做法**：`.github/workflows/ci.yml`（`services: postgres:16`）；`tests/global-setup.ts` 自动创建 `knowverse_test`；`storage/test-uploads/` 入 `.gitignore`；`.github/PULL_REQUEST_TEMPLATE.md`；`scripts/bench.ts` 生成 4 万条消息的基准库并输出 P50/P95 基线（供 A6、C3 共用，**W2 前交付**）。
- **验收**：① CI 上 `typecheck` + `test` 全绿；② 全新克隆 `npm ci && npm test` 直接通过；③ 跑完测试工作区干净；④ PR 模板含「变更/验证/影响」；⑤ bench 脚本一条命令产出基线与 JSON 结果。

#### D3 · 端到端 QA 与回归清单（4）
- **做法**：12 条主流程（登录、开场、提问+引用、历史组合检索、定位原消息、资料上传、练习选题、作答判题、证据修正、成长时间轴、班级星系、学习卡发布）写成清单，逐条手工 + 脚本回归；缺陷登记到 Issue 并复测。
- **验收**：① 清单全部通过或有明确的「已知问题」标注；② 缺陷闭环率 100%；③ 回归脚本可重复执行。

#### D4 · 合并与发布管理（2）
- **做法**：`main` 保护（Require PR + 1 approval + CI）；每周合并窗口；分支与 tag 规范；演示环境冻结脚本（`npm run demo:reset` + 截图基线）。
- **验收**：① 无直接 push 到 main；② 每个合并有记录；③ 发布 tag 可回滚。

#### D5 · 报告总集（5）
- **做法**：定骨架、术语表、图表编号、数字口径；写第 1、2、5、6、7 章；合并各章为 `docs/report.md`；导出 Word/PDF；最后统一校对。
- **验收**：① 四部分齐全；② 全文术语与数字一致；③ 图表编号连续、目录可跳转；④ 页数 45–60。

#### D6 · 答辩 PPT 统筹 + 彩排（2）
- **做法**：大纲 11–13 页 / 8 分钟；B 出版式；各人填页；D 合并并控时；两次彩排。
- **验收**：① 8 分钟不超时；② 每页有讲稿要点；③ 演示环境断网可跑（demo 模式兜底）。

---

## 6. 文档与 PPT 分工

### 6.1 报告章节表

| 章节 | Owner | 内容 | 页数 | 初稿 | 定稿 |
|---|---|---|---|---|---|
| 1 需求分析 | **D** | 背景、角色、功能/非功能需求、用例 | 4–5 | W4 | W6 |
| 2 概要设计 | **D** | 架构图、模块划分、技术选型、数据流 | 4–5 | W4 | W6 |
| 3 数据库设计 ★ | **A** | E-R、关系模式、函数依赖与范式、完整性约束、索引、权限模型、事务并发 | 10–12 | W4 | W5 |
| 4 详细设计 | **C**（智能体/RAG/记忆/检索）、**D**（资料/判题）、**A**（班级协作）、**B**（界面） | 时序、接口、错误处理、关键算法 | 12–15 | W4 | W6 |
| 5 系统实现 | **D** | 技术栈、目录、关键代码、演示/真实模式 | 5–6 | W5 | W6 |
| 6 系统测试 | **D** 汇总，用例各自提供 | 策略、用例表、结果、性能、安全、缺陷 | 6–8 | W5 | W6 |
| 7 部署与运维 | **D** | 环境、迁移、种子、备份、演示重置 | 3–4 | W5 | W6 |
| 8 大模型辅助设计记录 | **A** | 过程、17 条修改、合理性/规范程度分析、团队审阅 | 4–5 | W5 | W6 |
| 9 局限与展望 | **A + C** | 检索局限、真实模型、评测缺口 | 2 | W5 | W6 |
| 附录 | **A** | E-R 全图、数据字典、核心 SQL、EXPLAIN、API | 8–10 | W5 | W6 |

### 6.2 写作流程

1. **分文件写**：`docs/report/01-requirements.md` … `09-limitations.md`，每章开头写 `owner` 与 `状态`，避免多人同时改一个 Word。
2. **PR 提交**：每章一个 PR，D review 结构，A review 数据库相关内容。
3. **合并**：D 在 W5 用统一模板合并成 `docs/report.md`，统一编号与术语，再导出 Word/PDF。
4. **模板**（D 在 W4 提供）：标题层级、图表编号（图 3-1、表 3-1）、数字口径（以 DB 实测为准）、引用格式。

### 6.3 答辩 PPT

| 页 | 内容 | 负责人 |
|---|---|---|
| 1 | 封面 + 一句话 | B |
| 2 | 问题与定位（为什么不是普通问答） | D |
| 3 | 系统全景图 + 技术栈 | D |
| 4–5 | E-R 与关系模式、规范化取舍 | A |
| 6 | 数据库能力：权限/事务/索引/分区 | A |
| 7–8 | 设计语言 + 程序化建模 | B |
| 9 | 多球宇宙 | B |
| 10–12 | 智能体工具链、RAG 与引用、Memory | C |
| 13 | 判题沙箱安全 + 测试数据 | C / D |

- **版式**：B 出母版（配色沿用 `docs/visual-redesign.md`）。
- **讲稿**：A 2.5 分钟、B 2.5 分钟、C 3 分钟、D 1 分钟（含开场与收尾）。
- **彩排**：D 主持，W6 两次。

---

## 7. 协作规范

### 7.1 分支与提交

| 项 | 规范 |
|---|---|
| 主干 | `main` 受保护：Require PR、1 approval、CI 绿 |
| 分支 | `feat/a1-rls`、`feat/c3-inverted-index`、`fix/b1-greenhouse-glass`、`docs/d5-report-merge` |
| 提交 | Conventional Commits：`feat(db): 启用行级安全策略`、`fix(3d): 修正温室玻璃倾角`、`docs(report): 第 3 章初稿` |
| PR 大小 | 一个任务卡一个 PR；超过 400 行改动拆开 |
| 合并 | D 在每周合并窗口执行 squash merge；冲突由该文件 owner 解决 |

### 7.2 PR 模板

```markdown
## 变更
- 任务卡：A1
- 做了什么：

## 验证
- [ ] npm run typecheck
- [ ] npm test（新增用例：）
- [ ] 证据：截图 / EXPLAIN / 录屏路径

## 影响
- 迁移文件：无 / drizzle/0002（需 A 复核）
- 破坏性变更：无
- 需要谁 review：
```

### 7.3 本地环境（每人一套）

```bash
cp .env.example .env
docker compose up -d          # 有 Docker 优先；没有则用便携 PostgreSQL（见 README 补充）
npm ci
npm run db:migrate && npm run db:seed
npm run dev                   # http://localhost:3000
```

- **迁移**：只有 A 能合并 `drizzle/`；其他人需要改表先开 Issue，由 A 出迁移。
- **数据**：演示数据统一 `npm run db:seed` / `npm run demo:reset`；不要手工改库后截图。
- **密钥**：`.env` 不进仓库；真实模型 key 只放本地与演示机。

### 7.4 每周节奏

| 时间 | 事项 |
|---|---|
| 周一晚 20:00 | 站会 15 分钟：上周完成 / 本周计划 / 阻塞 |
| 周三 | 合并窗口 1（D） |
| 周五晚 | 合并窗口 2 + 20 分钟演示（当周可见产出） |

---

## 8. 排期（6 周）

| 周 | A | B | C | D | 周末必须能演示 |
|---|---|---|---|---|---|
| W1 | A1、A5 初版 | B1 | C1 | D1 设计、D2 | RLS 拦截、建模对比图、CI 绿 |
| W2 | A2、A3 | B2 | C3 起步 | D1、D3 清单 | 星系契约冻结、自转、真模型跑通 |
| W3 | A4、A6 | B3 | C2、C3 | D3、D4 | 倒排检索对比、多球宇宙可点 |
| W4 | A5 更新、A7 初 | B4、B7 | C4、C5 | D5 骨架 | 记忆可演示、报告骨架与模板 |
| W5 | A7 完成 | B5、B6 | C5 完成、C6 | D3 完成、D5 合稿 | 全书合稿、回归通过 |
| W6 | 评审 | B6 | C6 | D5 定稿、D6 | 报告定稿、PPT、彩排、tag |

**只有 4 周**：砍 A4、B5、C2、C4 的向量对照，其余不动。

**风险对冲**：
- C 最重（21）：`C2` 可转 D；`C4` 的向量部分可降级为文档讨论；
- D 末段最挤：报告骨架提前到 W4，QA 清单 W2 就定；
- 新表会让 E-R/字典返工：A5 分两轮，W4 定稿；
- 模型不稳定：demo 模式兜底，失败显式报错。

---

## 9. 开工清单

1. GitHub → Settings → Collaborators：邀请 B、C、D；
2. Settings → Branches：`main` 开启保护（PR + 1 approval + status checks）；
3. 建 W1–W6 六个 Milestone；标签 `db`、`agent`、`ui`、`infra`、`docs`、`P0`、`P1`；
4. 本文件作为第一个 PR 合入（顺便验证流程）；
5. 按 §5 建 27 个 Issue，标题直接用任务卡编号与名称；
6. 每人本地跑通 `docker compose up -d && npm run db:reset`，在群里报「环境 OK」。

---

## 10. 附：术语与命令速查

| 术语 | 含义 |
|---|---|
| 竖线 | 一条端到端的业务职责（数据/智能/呈现/交付） |
| 任务卡 | 一个 Issue + 一个 PR 的最小交付单元 |
| 证据 | 截图、EXPLAIN、测试输出、录屏；没有证据不算完成 |
| 受控冗余 | 为查询方便保留的重复列，用约束保证一致（如 `messages.user_id`） |
| demo 模式 | 不调用模型，回答来自固定逻辑 + 真实检索，界面标注 |

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（3000） |
| `npm run db:migrate` | 迁移 + 建 SQL 沙箱 |
| `npm run db:seed` / `npm run demo:reset` | 种子数据 / 重置演示账号 |
| `npm run db:reset` | 清库重建（仅本地） |
| `npm test` | 集成测试（需 `knowverse_test`，D2 后自动创建） |
| `npm run typecheck` | 类型检查 |
| `npm run explain` | 生成 4 万条数据并输出执行计划 |
