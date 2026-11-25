# KNOWVERSE 报告 TeX

现有模板项目可以替换 `main.tex`。原来的 `RUCReport.sty`、`figures/` 和 `reference.bib` 可以继续用。新建项目时上传同目录的 `main.tex`、`figures/` 和 `reference.bib`，选择 XeLaTeX。

组员信息填在 `main.tex` 的封面字段，报告内容直接填在各个标题下。空框架运行两次 XeLaTeX 即可刷新目录。正文加了 `\cite` 后，把空的参考文献标题和它后面的目录命令换成原模板的 `\reference`，再用 XeLaTeX、BibTeX、XeLaTeX 两遍重新编译。

封面校徽来自用户提供的 `DB_Knowverse.pdf`，提取时保留了矢量图。排版参考 xxmy7 的 [RUC 课程报告模板](https://www.overleaf.com/latex/templates/ruc-report-latex-template/hhwhvvwczbnm)（CC BY 4.0）。本地缺少原 `RUCReport.sty`，修订 PDF 使用 `main.tex` 内的备用排版设置编译。
