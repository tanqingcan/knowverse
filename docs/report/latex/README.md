# LaTeX 分章写作框架

这是**可编译的报告骨架**，不是已经完成的项目报告。目录、主笔、每节任务、现有真实 ER/截图和历史实验示例已经接入；作者须补完整正文、最终证据、姓名学号及审阅，再定稿。

详细写作任务见 [report-plan.md](../report-plan.md)，总入口是 [main.tex](main.tex)。第 4 章在 `chapters/modules/` 按模块拆开，避免同时修改一个文件。

## 编译

本机已经检测到 TeX Live 2025 的 XeLaTeX 和 BibTeX。从仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/report/latex/build.ps1
```

脚本执行 XeLaTeX → BibTeX → XeLaTeX → XeLaTeX，遇错误停止。结果在 `latex/build/main.pdf`，中间文件被局部 `.gitignore` 忽略。需要更新供团队查看的架构预览时执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/report/latex/build.ps1 -PublishPreview
```

它会将成功编译的 PDF 复制为 `docs/report/报告架构与分工预览.pdf`。正文写完以后另行命名最终报告，避免把带“写作任务”的骨架误交。

## 与用户原模板的关系

- 原始粘贴内容完整保存在 [template-original.tex.txt](../sources/template-original.tex.txt)。这里复用 `ctexart`、XeLaTeX、封面→目录→正文→文献的组织方式，将模板示例换成真实项目章节。
- 本次只有粘贴的主文件，没有实际 `RUCReport.sty`、logo、原 `reference.bib`，不能假装已经还原原模板的视觉样式。
- 默认缺少样式时使用基础 A4 封面和排版。若取得样式，放在此目录，`main.tex` 会加载并调用其 `\cover`；**需要阅读样式中的元信息定义，修改真实姓名、题目、logo 路径，并重新检查包冲突和版式**。本次只验证基础分支，没有验证未提供的样式。
- `metadata.tex` 管理基础封面元信息；原样式可能另有自己的变量，不推测接口。
- 样式/logo 目录局部忽略，需正式纳入仓库时，先确认来源许可并定向添加。
- Overleaf 使用时上传本报告目录和所引用的 `docs/er/advanced/`、`docs/screenshots/`，或将图片复制到本地 `figures/` 后修改路径；只上传 `main.tex` 不够。

## 各人文件

| 人 | 编辑文件 |
|---|---|
| A | 第 3/8 章、`modules/04-growth-collaboration.tex`、数据库/SQL 附录 |
| B | 第 1/5 章，提供第 2 章图与第 6 章 UI 材料 |
| C | 第 2 章、`modules/04-chat-history.tex`、`04-materials.tex`、`04-memory.tex`、摘要/第 9 章初稿 |
| D | `modules/04-practice.tex`、第 6/7 章、附录贡献/证据、主文件集成 |

共同附录由 D 接收材料后汇总，修改别人的正文先约定。不要编辑忽略目录 `build/` 里的生成文件。

## 写作约定

- 正文用 `\label` / `\ref` 引用图表和章节，不写“见上图”。图表按章自动编号。
- `\code{table_name}` 显示带下划线的表名，`\Evidence{path}` 记录仓库证据入口；定稿时将入口融入正常说明或附录索引。
- 每幅图有图题，真实截图注明日期、环境、demo/live；示意行与动画明确标为示意。
- 核心字段表按真实目录补列类型、可空性、键和约束。框架中的精选列不是完整数据字典。
- 使用 `\cite{key}`，条目写入 `reference.bib`。这里只提供已知的课程文件和本项目两项；教材、官方资料和论文由作者核对后补充，不编造文献。
- `\Writing{负责人}{任务}` 是可见写作提示，写完后用正式正文替换；仅删除提示而不补正文不算完成。
- 提交前移除写作说明、补摘要/成员/版本/贡献，核对所有实验和旧稿纠错，复测后完整编译并逐页查看。

本次编译预览中的 ER 与截图直接引用已有真实资产；实验表明确引用 2026-11-17 历史记录，不声称在 2026-11-21 重新运行了业务测试。

2026-11-21 框架验收：21 个 TeX 文件、27 个 Markdown 本地链接无缺失；XeLaTeX/BibTeX 完整编译为 25 页，无未定义引用、编译警告或溢出警告；25 页均已渲染查看，并单独放大检查 ER、字段表与截图页。机器检查记录见 [validation.json](../validation.json)。原 RUC 样式分支因缺少样式文件未测试。
