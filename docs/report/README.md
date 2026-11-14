# 报告章节协作说明

报告按章节拆成独立文件，各自认领、各自 PR，最后由 D 合并成 `docs/report.md` 并导出 Word/PDF。

| 章节 | 文件 | Owner | 状态 |
|---|---|---|---|
| 1 需求分析 | `01-requirements.md` | D | 待写 |
| 2 概要设计 | `02-architecture.md` | D + B（架构图） | 待写 |
| **3 数据库设计** | `03-database-design.md` | **A** | **初稿完成** |
| 4 详细设计 | `04-detailed-design.md` | C（智能体/RAG/记忆）、D（资料/判题）、A（班级）、B（界面） | 待写 |
| 5 系统实现 | `05-implementation.md` | D | 待写 |
| 6 系统测试 | `06-testing.md` | D 汇总 | 待写 |
| 7 部署与运维 | `07-deployment.md` | D | 待写 |
| **8 大模型辅助设计记录** | `08-llm-assisted-design.md` | **A** | **初稿完成** |
| 9 局限与展望 | `09-limitations.md` | A + C | 待写 |
| 附录 | `appendix.md` | A | 待写 |

## 约定

- 图表编号：`图 3-1`、`表 3-1`；引用时写清编号，**不要用“上图/下表”**。
- 数字口径：一律以数据库实测为准（`npm run docs:dictionary` 与 `docs/sql/explain-results.md`），不写估算。
- 术语表由 D 维护：同一概念只用一个词（如“知识点”不写成“概念点”）。
- 合并顺序：01 → 09；附录放最后。导出 Word 后检查目录与图表编号是否连续。
