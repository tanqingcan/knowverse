## 1.分工总表

按业务纵向切，每人一条完整竖线，避免前后端互相等。

| 竖线 | 人 | 范围 | 需要解决的问题 |
|---|---|---|---|
| **数据与身份** | **A** | 模式与迁移、权限、班级/身份后端、E-R 与数据字典、报告数据库章、代码评审 | 「这套模式凭什么成立？权限凭什么信数据库？」 | 
| **检索与智能** | **C** | 对话智能体、RAG、Memory、历史检索、资料流水线、评测 | 「它为什么答得对、记得住？」 |
| **呈现与宇宙** | **B** | 全部 UI/3D、自转、多球宇宙、记忆界面、性能与可访问性 | 「第一眼的差异化怎么做的？」 | 
| **集成与交付** | **D** | 判题沙箱、CI 与测试、端到端 QA、合并发布、报告总集、PPT 统筹 | 「整套东西真的能跑、能交吗？」 |


---

## 2. 模块所有权（谁能改哪些文件）

**规则：改到别人的目录，必须在该 PR 里 @ 对方 review；**

| 目录 / 文件 | A | B | C | D |
|---|---|---|---|---|
| `drizzle/`、`src/db/` | ✅ 唯一合并人 | | 起草 SQL| |
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

---

## 3. 任务卡

> 每张卡 = 一个 Issue 
> 「验收证据」是要贴进 PR 或报告里的东西，没有证据不算完成。

### 5.1 A ：数据与身份

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

#### A5 · E-R 定稿 + 数据字典 + 宽表对比图（2）
- **目标**：让图与库严格一致，且符合教材写法。
- **做法**：`docs/er/gen_er.py` 增加主键下划线、弱实体双线矩形与双线联系；W1 出 44 表初版，W4 新表（`user_memories` 等）落地后定稿；`scripts/docs-dictionary.ts` 从 `information_schema` 生成 `docs/schema/data-dictionary.md`；补一张「宽表 vs 分解」对比图（讲规范化用）。
- **验收**：① 5 张图重新生成；② 字典与库 diff 为空；③ 图注说明「`message_terms`/`audit_log` 是实现细节，不入概念模型」。

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


---