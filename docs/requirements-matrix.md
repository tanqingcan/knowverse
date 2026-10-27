# 作业要求 — 实现位置 — 验证证据 对照表

依据：课程附件《大作业描述 261020.pptx》（7 页）。表中“要求”一栏只列附件中写明的内容；“产品增强”单独列出，不表示是评分项。

## 一、附件中的要求

| # | 附件原文要点 | 实现位置 | 验证证据 |
|---|---|---|---|
| 1 | 组队 1–5 人，提交代码和实验报告，课堂展示、答辩 | 本仓库；`docs/report-draft.md`；`docs/demo-scripts.md`；`docs/team-template.md` | 报告草稿与脚本已提供，**待团队审阅、填写分工** |
| 2 | 个性化答疑：学生就课程内容与大模型对话，自动生成回复 | `src/server/chat.ts`、`src/server/agent/*`；界面 `ChatPanel.tsx` | `tests/chat-agent.test.ts`（上下文、持久化、引用、真实模式成功/超时/非法输出/重试）；E2E 步骤“回答带资料引用” |
| 3 | 历史问答梳理：按时间、关键词、知识点等维度检索历史对话 | `src/server/history.ts`（`buildHistorySql`）；界面 `HistoryPanel.tsx`；定位 `conversationWindow` | `tests/history.test.ts`（中英文关键词、时区边界、知识点、组合、分页、隔离、定位、继续提问）；E2E“组合检索缩小结果”“定位原消息”；`docs/sql/explain-results.md` |
| 4 | 推荐：教学资料整理（PPT/习题元数据管理） | `src/server/materials.ts`、`src/server/extract`；题库 `tasks / task_versions / task_hints`；界面 `MaterialsPanel.tsx` | `tests/materials-collab.test.ts`（PPTX 页号、PDF 页码、扫描件 OCR 提示、不支持类型、伪造扩展名、权限）；E2E“引用定位到资料片段” |
| 5 | 推荐：个性化训练（根据薄弱点自动出题） | `src/server/practice.ts`（`createPractice` 依据错题/阶段/待复习选题，新用户诊断；SQL 沙箱 `sandbox.ts`） | `tests/practice-growth.test.ts`；E2E“规则诊断”“独立变式通过 → 开花”。说明：演示模式从题库按薄弱点**选题**；真实模式下练习面板可让模型针对知识点（参考最近错题）**生成新变式**，经结构校验、参考 SQL 在沙箱中执行通过后才保存（`generateTask`，测试用本地模拟服务验证） |
| 6 | 数据库设计：自行设计或与大模型交互，完成 E-R 图和数据库模式 | `src/db/schema.ts`、`drizzle/*.sql`、`docs/er/*`、`docs/schema/*` | 迁移在 PostgreSQL 16 上执行通过；图由脚本生成 |
| 7 | 理解并设计合理的数据库模式与实体关系 | `docs/database-design.md` §2–3 | — |
| 8 | 从规范化程度和应用开发方便性综合评判最终模式 | `docs/database-design.md` §4（函数依赖、候选键、范式、无损连接、受控冗余） | — |
| 9 | E-R 图形式尽量接近教材 | `docs/er/er-overview.svg` + 4 张局部图（Chen 表示法：矩形/椭圆/菱形/基数，弱实体双线） | 图文件 |
| 10 | 使用大模型辅助时记录结果，分析合理、规范程度 | `docs/llm-assisted-design.md` | 标注为待团队审阅 |
| 11 | 图形化用户界面，建议 B/S 架构 | Next.js 浏览器应用（`src/app`、`src/components`） | 截图 `docs/screenshots/`（1440×900、390×844） |
| 12 | 需要设计多个表保存数据 | 44 张表（核心 32 + 增强 12） | `drizzle/0000_init.sql` |
| 13 | 可以根据需求调整功能 | 增加了成长规则、班级星系等，见下表 | — |
| 14 | 报告包括需求分析、概要设计、详细设计、系统测试 | `docs/report-draft.md` | 草稿 |
| 15 | 10.27 前组队；其他选题需在此前告知助教 | 非代码事项 | 由团队自行处理（本项目使用附件给定的“个人学习助手”题目） |

## 二、产品增强（不是附件中的评分项）

| 增强 | 实现位置 | 验证 |
|---|---|---|
| 星球花园可视化（3D 绘本花园 + 静态绘本降级、花园 / 专注两种模式、低动效、键盘可达） | `src/components/world/*`、`src/components/space/SpaceApp.tsx`、`src/components/art/*` | `docs/screenshots/ui/ui-09`、`ui-10`（禁用 WebGL）、`ui-11`–`ui-12b`（键盘）、`ui-13`（低动效）；`docs/visual-redesign.md` |
| 可解释成长规则与证据分类 | `src/server/growth.ts` | `practice-growth.test.ts` 成长规则组 |
| 作答幂等、事务回滚、outbox | `practice.ts`、`classes.ts` | 测试“幂等”“并发重复提交”“事务中途失败” |
| 班级星系、分享偏好、互补伙伴、共学名额、学习卡版本与发布 | `src/server/classes.ts`、`GalaxyPanel.tsx`、`CardsPanel.tsx` | 测试“并发申请最后一个名额”“伙伴匹配” |
| 先修关系递归 CTE 与防环 | `concepts.ts`、`drizzle/0001` | 测试“先修关系” |
