# 数据库阶段汇报材料

- 最新关系建模增强版：[Word文档](KNOWVERSE数据库阶段汇报-关系建模增强版.docx)，保留修订版内容，采用错位分域的Chen概念ER（13实体、12菱形联系、21椭圆属性及ISA，A3横向整页），另附设计理由与全库索引。现有修订版未覆盖。
- 现场讲解主图：[学习事实的可追溯关系模型](../er/advanced/03-learning-model.svg)，三组实体围绕版本、引用与证据连接，避免全字段堆叠。
- 完整真实ER：[55表106外键全库SVG](../er/advanced/01-full-schema.svg)；[八个业务域字段级图与读图说明](../er/advanced/README.md)。
- 增强版生成：`scripts/enhance-er-briefing.py --source <源文档.docx>`；未指定源文档时优先本地修订版，否则使用原版。图片均嵌入Word。

- 图文Word文档：[KNOWVERSE数据库阶段汇报.docx](KNOWVERSE数据库阶段汇报.docx)
- 可复制的提纲与讲稿：[database-progress-briefing.md](../database-progress-briefing.md)
- 图片源：../briefing-assets/；生成脚本：../../scripts/build-database-briefing.py

文档按六部分组织：业务截图、核心E-R关系、规范化取舍、SQL改写流程、性能图与条件、验证及后续计划。正文包含真实界面截图和可追溯的基准数字。

增强版已核对包结构、5个嵌入图及图片哈希，并使用LibreOffice生成9页页面图像逐页检查。第3页为A3横向ER整页，其余为纵向正文。渲染器收尾发生临时目录清理错误，已产生的全部9页图像可正常查看，未发现裁切或图文重叠。图片已嵌入，不依赖外链。
