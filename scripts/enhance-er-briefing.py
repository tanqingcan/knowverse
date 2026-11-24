"""从用户修订稿另存增强版，采用A3横向ER整页与一页设计讲解，不覆盖源稿。"""
from pathlib import Path
from copy import deepcopy
import argparse,json
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'docs/er/advanced'
OUT=ROOT/'docs/briefings/KNOWVERSE数据库阶段汇报-关系建模增强版.docx'
p=argparse.ArgumentParser();p.add_argument('--source',type=Path);args=p.parse_args()
revised=ROOT/'docs/briefings/KNOWVERSE数据库阶段汇报-修订版.docx'
source=args.source or (revised if revised.exists() else ROOT/'docs/briefings/KNOWVERSE数据库阶段汇报.docx')
assert source.resolve()!=OUT.resolve()
doc=Document(source);body=doc._element.body
start=next(p for p in doc.paragraphs if p.text=='核心关系如何组织')
end=next(p for p in doc.paragraphs if p.text=='规范化与受控冗余')
a,b=body.index(start._p),body.index(end._p)
# 前一页原有手动分页改为分节，避免空白页。
prev=start._p.getprevious()
if prev is not None and not ''.join(prev.itertext()).strip() and list(prev.iter(qn('w:br'))):
 body.remove(prev);a-=1;b-=1
for el in list(body)[a:b]:body.remove(el)
for p in doc.paragraphs:
 if p.text.startswith('关系建模：'):
  p.text='关系建模：全库覆盖八个业务域、55张逻辑表和106条外键。本次用一张主图讲清版本追溯、联系实体与学习证据，再说明成员资格的复合外键设计。'

def before(p):end._p.addprevious(p._p);return p
def para(t='',style=None):return before(doc.add_paragraph(t,style))
def heading(t,l=1):return before(doc.add_heading(t,l))
def page():before(doc.add_paragraph()).add_run().add_break(__import__('docx').enum.text.WD_BREAK.PAGE)
def section_break(landscape=False):
 p=para();pr=p._p.get_or_add_pPr();s=deepcopy(body.sectPr)
 typ=s.find(qn('w:type'))
 if typ is None:typ=OxmlElement('w:type');s.insert(0,typ)
 typ.set(qn('w:val'),'nextPage')
 if landscape:
  size=s.find(qn('w:pgSz'));size.set(qn('w:w'),str(int(16.54*1440)));size.set(qn('w:h'),str(int(11.69*1440)));size.set(qn('w:orient'),'landscape')
  margin=s.find(qn('w:pgMar'))
  for k in ['top','bottom','left','right']:margin.set(qn('w:'+k),str(int(.55*1440)))
 pr.append(s);p.paragraph_format.space_after=Pt(0);p.paragraph_format.space_before=Pt(0)
 return p
section_break(False)
p=para();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(0);p.paragraph_format.first_line_indent=Inches(0)
r=p.add_run();r.font.size=Pt(1);r.add_picture(str(A/'03-learning-model.png'),width=Inches(15))
r._element.find('.//'+qn('wp:docPr')).set('descr','图2 Chen概念ER 十三个实体 十二个菱形联系 二十一个椭圆属性与消息ISA')
section_break(True)
heading('关系建模的设计理由')
para('图2采用教材Chen画法：矩形表示实体，菱形表示联系，椭圆表示属性，下划线表示键属性。1、M、N表示最大基数，双线表示实体全部参与该联系。主图选取13个实体、12个联系和21个属性；完整55表106外键另见逻辑图册。')
heading('身份与版本分离',2)
para('资料、题目、学习卡分别具有稳定身份和内容版本。资料版本的(material_id,version_no)唯一，片段的(version_id,ord)唯一；消息引用片段，学生作答绑定task_version_id，因此更新内容不应改变历史引用和作答的依据。主图用两条版本链展示同一建模思想。')
heading('联系本身也是事实',2)
para('消息与资料片段之间的“引用”画成M:N菱形联系，摘录quote与引用顺序属于该联系；“标注”的确认状态和置信度也接在联系上。转换为关系模式时，两者分别落成message_citations与message_concepts关联表。用户与知识点的“当前状态”同理映射为learning_states。')
heading('事实 当前状态与历史分离',2)
para('attempts记录作答事实，evaluations的attempt_id唯一，意味着一次作答最多一条评价，并不要求作答提交时已经存在评价。learning_evidence保留来源和撤销信息；learning_states用(user_id,concept_id)联合主键表示当前状态，growth_events记录阶段变化，支持解释和重新计算。')
heading('复合外键表达成员资格',2)
para('分享偏好引用(class_id,user_id)，贡献引用(group_id,user_id)，表达用户属于指定班级或小组。messages以(conversation_id,user_id)复合外键保证冗余归属一致。这些列级约束在配套逻辑图中展开。')
heading('消息角色的ISA特化',2)
para('消息按role分为用户消息与助手消息，子类型继承消息ID及公共属性。role非空且CHECK只允许user、assistant，因此该特化互斥且完全。物理实现仍为单一messages表，ISA不代表新增两张子表。')
para('下一阶段验证版本内容变更规则，扩大证据撤销与并发状态重算回归。容量并发、先修防环和RLS等规则由触发器、事务与策略保证，不作为额外概念联系绘入主图。')
page()
# 原稿后续正文与截图保留；补充全库图册索引。
doc.add_page_break();doc.add_heading('全库关系图册索引',1)
doc.add_paragraph('主图用于现场讲解，全库图用于说明覆盖范围，字段级分图用于回答约束和数据类型问题。当前快照覆盖55张逻辑表、106条外键、23张RLS表、11个业务触发器，排除分区子表与视图。')
doc.add_paragraph('推荐查看顺序：03-learning-model.svg主图 → 01-full-schema.svg全库图 → 各领域detail文件。所有文件均位于docs/er/advanced，SVG可任意放大。')
m=json.loads((A/'diagram-manifest.json').read_text(encoding='utf8'))
labels=['身份与访问','知识目录与目标','星球与布局','问答检索与记忆','资料版本与引用','训练证据与成长','班级共学与发布','审计事件与CDC']
t=doc.add_table(rows=1,cols=3);t.style='Table Grid'
for c,v in zip(t.rows[0].cells,['业务域','表数','字段级文件']):c.text=v
for label,(key,names) in zip(labels,m['groups'].items()):
 for c,v in zip(t.add_row().cells,[label,str(len(names)),'detail-'+key+'.svg']):c.text=v
for row in t.rows:
 for cell in row.cells:
  for p in cell.paragraphs:
   p.paragraph_format.space_after=Pt(5)
   for r in p.runs:r.font.size=Pt(10)
doc.add_paragraph('字段级图显示全部主外键列与部分业务属性；完整属性、CHECK、唯一索引谓词、触发器和RLS策略定义见schema-metadata.json。全库图逐表逐边与系统目录校验，避免按字段名猜关系。')
for name in ['Title','Subtitle','Heading 1','Heading 2']:
 doc.styles[name].font.color.rgb=RGBColor(0,0,0)
 for p in doc.paragraphs:
  if p.style.name==name:
   for r in p.runs:r.font.color.rgb=RGBColor(0,0,0)
for i,pr in enumerate(doc._element.iter(qn('wp:docPr')),1):pr.set('id',str(i))
doc.core_properties.title='KNOWVERSE 数据库阶段汇报 关系建模增强版'
doc.save(OUT)
print(json.dumps({'source':str(source),'output':str(OUT),'images':len(doc.inline_shapes),'sections':len(doc.sections)},ensure_ascii=False))
