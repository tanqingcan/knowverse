# 报告章节协作说明

最终报告以 [报告架构与四人分工](report-plan.md) 为准，正式编辑入口为 [LaTeX 主文件](latex/main.tex)，编译方式见 [说明](latex/README.md)。[架构预览 PDF](报告架构与分工预览.pdf) 供审阅目录与版式，**不是完成的项目报告**。旧 Markdown 保留为历史资料，不再另维护内容分叉的 `docs/report.md`。

| 章节 | 文件 | Owner | 状态 |
|---|---|---|---|
| 1 需求分析 | `latex/chapters/01-requirements.tex` | B，C 复核 | 框架就绪 |
| 2 概要设计 | `latex/chapters/02-architecture.tex` | C，A/B 复核 | 框架就绪 |
| **3 数据库设计** | `latex/chapters/03-database-design.tex` | **A，C/D 复核** | 旧稿须修订 |
| 4 核心业务详细设计 | `latex/chapters/04-detailed-design.tex`、`modules/*.tex` | C 答疑/检索/资料/记忆；D 判题；A 成长/协作 | 框架就绪 |
| 5 系统实现与交互 | `latex/chapters/05-implementation.tex` | B，C/D 复核 | 框架就绪 |
| 6 系统测试与实验 | `latex/chapters/06-testing.tex` | D 汇总，A/B/C 各交专项 | 框架就绪 |
| 7 部署与运维 | `latex/chapters/07-deployment.tex` | D，A 复核 | 框架就绪 |
| **8 大模型辅助审查** | `latex/chapters/08-llm-assisted-design.tex` | **A 汇总，全员交真实案例** | 旧稿须修订 |
| 9 总结、局限与计划 | `latex/chapters/09-conclusion.tex` | C 汇总，全员确认 | 框架就绪 |
| 附录 | `latex/chapters/appendix-*.tex` | A 字典/SQL，C 接口，B 截图，D 证据/贡献 | 框架就绪 |

## 约定

- 图表编号：`图 3-1`、`表 3-1`；引用时写清编号，**不要用“上图/下表”**。
- 数字口径：带日期的系统目录和原始实验记录为准；旧全库范式计数已撤回，不能从历史草稿直接引用。
- 术语表由 D 维护：同一概念只用一个词（如“知识点”不写成“概念点”）。
- D 负责集成，不代写其他人的模块。姓名、学号、贡献比例、审阅签名由本人核对填写。
- 合并顺序见架构文档，PDF 定稿前复测最终代码、核对目录/图表/引用并逐页查看。
