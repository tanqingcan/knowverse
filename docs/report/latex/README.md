# LaTeX 分章写作框架

这是**可编译的报告骨架**，不是已经完成的项目报告。目录、主笔、每节任务、现有真实 ER/截图和历史实验示例已经接入；作者须补完整正文、最终证据、姓名学号及审阅，再定稿。

组员填写用 [原模板版 main.tex](../ruc-template/main.tex)，分工和配图见 [任务单](../report-plan.md)。本目录的 [main.tex](main.tex) 保留此前的分章提示和例图，可结合 [详细版存档](../report-plan-detailed.md) 查材料。

## 编译

本机已经检测到 TeX Live 2025 的 XeLaTeX 和 BibTeX。从仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/report/latex/build.ps1
```

脚本依次运行 XeLaTeX、BibTeX、XeLaTeX 两遍，输出到 `latex/build/main.pdf`。要更新只有一级标题的 PDF 大纲，使用以下命令。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/report/latex/build.ps1 -PublishPreview
```

这个命令编译 [outline.tex](outline.tex)，输出至 `docs/report/报告架构与分工预览.pdf`。

## 与用户原模板的关系

- 原始粘贴内容完整保存在 [template-original.tex.txt](../sources/template-original.tex.txt)。这里复用 `ctexart`、XeLaTeX、封面→目录→正文→文献的组织方式，将模板示例换成真实项目章节。
- 本次只有粘贴的主文件，没有实际 `RUCReport.sty`、logo、原 `reference.bib`，不能假装已经还原原模板的视觉样式。
- 默认缺少样式时使用基础 A4 封面和排版。若取得样式，放在此目录，`main.tex` 会加载并调用其 `\cover`；**需要阅读样式中的元信息定义，修改真实姓名、题目、logo 路径，并重新检查包冲突和版式**。本次只验证基础分支，没有验证未提供的样式。
- `metadata.tex` 管理基础封面元信息；原样式可能另有自己的变量，不推测接口。
- 样式/logo 目录局部忽略，需正式纳入仓库时，先确认来源许可并定向添加。
- Overleaf 上传本报告目录和所引用的 `docs/er/advanced/`、`docs/screenshots/`。也可以把引用的图片复制到 `assets/`，再调整对应路径。

## 各人文件

| 人 | 编辑文件 |
|---|---|
| A | 第 3/8 章、`modules/04-growth-collaboration.tex`、数据库/SQL 附录 |
| B | 第 1/5 章，拍真实截图，给 C 对架构图的界面入口，给 D 提供 UI 证据 |
| C | 第 2 章及总架构图、`modules/04-chat-history.tex`、`04-materials.tex`、`04-memory.tex`、摘要/第 9 章初稿 |
| D | `modules/04-practice.tex`、第 6/7 章、附录贡献/证据、主文件集成 |

共同附录由 D 接收材料后汇总，修改别人的正文先约定。不要编辑忽略目录 `build/` 里的生成文件。

## 写作约定

- 新配图放本目录的 `assets/`。流程图和架构图保留可编辑源稿，并导出 PDF。运行截图放 `assets/screenshots/`，保存 PNG 原图。通过 `\includegraphics[width=\linewidth]{assets/system-architecture.pdf}` 这类路径引用实际交付的图。
- 小节、案例和图的位置由作者按内容调整。素材位置可以查阅 [详细版存档](../report-plan-detailed.md)。
- 正文用 `\label` / `\ref` 引用图表和章节，不写“见上图”。图表按章自动编号。
- `\code{table_name}` 显示带下划线的表名，`\Evidence{path}` 记录仓库证据入口；定稿时将入口融入正常说明或附录索引。
- 每幅图有图题，真实截图注明日期、环境、demo/live；示意行与动画明确标为示意。
- 核心字段表按真实目录补列类型、可空性、键和约束。框架中的精选列不是完整数据字典。
- 使用 `\cite{key}`，条目写入 `reference.bib`。这里只提供已知的课程文件和本项目两项；教材、官方资料和论文由作者核对后补充，不编造文献。
- `\Writing{负责人}{任务}` 是可见写作提示，写完后用正式正文替换；仅删除提示而不补正文不算完成。
- 提交前移除写作说明、补摘要/成员/版本/贡献，核对所有实验和旧稿纠错，复测后完整编译并逐页查看。

正文框架引用已有 ER 和运行截图，实验表使用 2026-11-17 的原始记录。

编译与版式的检查记录见 [validation.json](../validation.json)。
