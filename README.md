# 知屿 KNOWVERSE：星球花园式个人学习智能体

> 在自己的星球上，养出属于你的花。

《数据库系统概论》大作业。正式报告题目：《知屿 KNOWVERSE：基于学习记录与关系数据库的个人学习助手》。

每个学习者拥有一颗星球：学科是花圃，知识点是植物，学习目标是探索路线。向导“星灯”结合你的目标、近期对话和资料回答问题（引用资料版本与页码），所有问答可以按关键词、日期和知识点检索并定位回原消息；植物只会因为真实的学习证据成长——提问、笔记、引导练习、独立作答，以及没做过的独立变式题。

## 功能一览

| 层级 | 功能 | 状态 |
|---|---|---|
| P0 课程必选 | 登录 / 演示账号、开场、个人星球 | 已实现 |
| | 个性化答疑（上下文、资料引用、知识点候选标签、失败重试） | 已实现 |
| | 会话列表；历史问答组合检索（关键词 + 日期 + 知识点 + 学科、分页、高亮）；定位原消息并继续提问 | 已实现 |
| | 数据持久化、权限隔离、基础异常处理 | 已实现 |
| P1 优先增强 | 资料温室（TXT / MD / 文本 PDF / PPTX 提取，版本，分块，候选概念，引用定位） | 已实现 |
| | 薄弱点练习（诊断、选题理由、提示记录、SQL 只读沙箱判题、选择 / 数值 / 开放题） | 已实现 |
| | 花朵成长与依据、证据修正、成长时间轴与回放 | 已实现 |
| P2 | 班级星系、分享偏好、互补伙伴匹配、共学小组（并发名额）、贡献、学习卡版本与发布、outbox | 已实现（基础版） |

界面：3D 绘本微缩花园（React Three Fiber，固定 3/4 俯视角、有限拖动）+ 无 WebGL 时的静态绘本场景；花园模式 / 专注学习模式；桌面与手机布局；低动效；键盘可达。设计说明见 `docs/visual-redesign.md`，截图见 `docs/screenshots/ui/`。

## 快速开始

需要：**Node.js 20 或 22**、**PostgreSQL 16**（推荐 Docker Desktop）。

```bash
# 1. 配置
cp .env.example .env            # Windows PowerShell：Copy-Item .env.example .env

# 2. 启动数据库（Docker Desktop）
docker compose up -d

# 3. 安装依赖（使用锁文件）
npm ci

# 4. 建表、创建 SQL 练习沙箱、写入演示数据
npm run db:migrate
npm run db:seed

# 5. 运行
npm run dev                      # 开发模式  http://localhost:3000
# 或
npm run build && npm run start   # 生产模式（课堂展示更流畅）
```

演示账号：`demo / knowverse`（预置历史在界面上标注“预置”）。首页也可以点“体验新旅人开场”，从零走一遍开场流程。演示前运行 `npm run demo:reset` 恢复演示账号的初始状态。

不用 Docker 时：安装 PostgreSQL 16，按 `.env` 中的 `DATABASE_URL` 创建数据库 `knowverse`；`ADMIN_DATABASE_URL` 需要能创建角色与数据库的账户（用于建立只读 SQL 沙箱 `knowverse_sandbox` 与角色 `kv_sandbox`）。若没有这个权限，迁移会提示，SQL 题会显示“沙箱未配置”，其它功能不受影响；也可以由管理员手动执行 `sandbox/setup.ts` 中的步骤。

## 配置大模型（可选）

默认 `LLM_MODE=demo`：**不调用任何模型**，回答来自固定演示逻辑与真实的资料检索结果，界面与数据库都标注为演示；消息、引用、标签、证据仍然真实写入。

真实模式（OpenAI 兼容的 Chat Completions 接口）：

```ini
LLM_MODE=live
LLM_BASE_URL=https://api.openai.com/v1      # 或其它兼容服务的地址
LLM_API_KEY=sk-...                           # 只在服务端读取
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=45000
LLM_TOOL_CALLING=true                        # 服务商不支持 function calling 时改为 false
```

修改后重启服务。真实模式下调用失败会显示错误与“重试”，不会退回演示内容。说明：真实模式只用本地模拟服务测试过错误处理路径，**尚未连接真实模型做端到端验证**，第一次使用请先问一两个问题确认。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` / `build` / `start` | 开发 / 构建 / 生产运行 |
| `npm run db:migrate` | 执行 `drizzle/` 中的 migration，并创建 SQL 沙箱 |
| `npm run db:seed` / `demo:reset` | 写入课程目录、公共资料、题库；重建演示账号 |
| `npm run db:reset` | 清空本地业务库并重新 migrate + seed（只允许 localhost） |
| `npm run db:generate` | 修改 `src/db/schema.ts` 后生成新的 migration |
| `npm test` | 集成测试（自动使用独立的 `knowverse_test` 库） |
| `npm run explain` | 在独立库 `knowverse_bench` 生成模拟数据并输出 `docs/sql/explain-results.md` |
| `npm run docs:diagrams` | 重新生成 E-R 图与关系模式图（需要 Python 3 与 Graphviz） |
| `node tests/e2e/demo-flow.mjs` | 浏览器端到端冒烟（需另行安装 Playwright） |

## 目录

```
src/
  app/                 页面（/、/welcome、/space）与 API（/api/*）
  components/          world/（3D 花园、角色、静态绘本场景）、space/（应用框架与面板）、原创插画
  db/                  Drizzle 模式与连接
  server/              业务逻辑：chat、history、materials、practice、growth、world、classes、agent/
drizzle/               migration（0000 由 drizzle-kit 生成，0001 手写约束与触发器）
sandbox/               SQL 练习数据集与只读沙箱创建
scripts/               migrate / seed / reset / explain
seed/materials/        原创演示资料（MD、PPTX、PDF、TXT、扫描件示例）
tests/                 Vitest 集成测试与 e2e 冒烟脚本
docs/                  报告草稿、E-R 图、关系模式图、数据库设计、智能体、SQL、测试、演示脚本
```

## 文档

| 文档 | 内容 |
|---|---|
| `docs/report-draft.md` | 实验报告草稿（需求分析、概要设计、详细设计、数据库与规范化、实现、测试、总结） |
| `docs/er/` | 教材风格 E-R 图（总览 + 4 张局部图） |
| `docs/schema/` | 关系模式图（由数据库目录生成） |
| `docs/database-design.md` | 实体边界、关系模式、函数依赖与范式、索引、删除策略、事务 |
| `docs/llm-assisted-design.md` | 大模型辅助数据库设计记录（待团队审阅） |
| `docs/agent.md` | 智能体结构、工具定义、提示词、成长规则 |
| `docs/sql/core_queries.sql` · `explain-results.md` | 核心 SQL 与 EXPLAIN ANALYZE |
| `docs/test-report.md` · `docs/test-evidence/` · `docs/screenshots/` | 测试用例、实际结果、截图 |
| `docs/visual-redesign.md` | 视觉与交互重构：构图、色板、材质、资产完成度、两种模式、动画、性能、限制 |
| `docs/demo-scripts.md` | 三分钟版、八分钟版、30 秒宣传流程 |
| `docs/requirements-matrix.md` | 作业要求—实现位置—验证证据 |
| `docs/team-template.md` | 团队分工模板（由团队填写） |

## 已知限制

- 资料检索是词法检索（ILIKE + pg_trgm）；没有向量检索。两个字的中文关键词无法使用 trigram 索引（结果仍正确）。
- 演示模式的回答只覆盖少数主题（LEFT JOIN、内连接、条件概率、贝叶斯、范式、分组聚合），其它问题会如实说明并列出检索到的资料片段。
- 开放题在演示模式下按关键词规则评价，会误判；界面已注明。
- 扫描件只提示需要 OCR，没有内置 OCR；Word、Excel 等类型只保存元数据。
- 3D 在无 GPU 的环境中较慢，可在“设置”切换为“静态绘本”。3D 只在软件渲染下测试过，未在真实 GPU / 真机上测帧率。
- outbox 的投递目标是服务端日志，没有接入外部通知。
- 成长阶段是产品规则，不是对掌握程度的测量；本项目没有做用户实验。

## 素材与版权

植物、角色、道具、场景均为本项目程序化生成的原创 3D 模型与 SVG 插画（未使用外部模型或贴图）；演示资料为原创文本。未使用外部图片、影视或商品形象，也未引用任何译本文案。“小王子式星球与玫瑰”只作为叙事气质的参考。
