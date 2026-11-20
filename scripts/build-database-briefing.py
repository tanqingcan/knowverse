"""生成数据库阶段汇报 Word；使用 Codex bundled Python 的 python-docx/Pillow。"""
from pathlib import Path
import json,math
from PIL import Image,ImageDraw,ImageFont
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
ROOT=Path(__file__).resolve().parents[1]
ASSET=ROOT/'docs/briefing-assets';ASSET.mkdir(exist_ok=True)
OUT=ROOT/'docs/briefings/KNOWVERSE数据库阶段汇报.docx';OUT.parent.mkdir(exist_ok=True)
FONT='C:/Windows/Fonts/msyh.ttc';BOLD='C:/Windows/Fonts/msyhbd.ttc'
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
NAVY='#34445c';BLUE='#4478a6';TEAL='#237f77';GRAY='#667383';LIGHT='#eef3f7'
def canvas(w,h):
 im=Image.new('RGB',(w,h),'white');return im,ImageDraw.Draw(im)
def txt(d,xy,t,size=30,fill=NAVY,b=False,anchor=None):d.text(xy,t,font=font(size,b),fill=fill,anchor=anchor)
def box(d,xy,title,sub=''):
 d.rectangle(xy,outline=NAVY,width=3);x=(xy[0]+xy[2])/2;y=(xy[1]+xy[3])/2
 txt(d,(x,y-13 if sub else y),title,32,b=True,anchor='mm')
 if sub:txt(d,(x,y+30),sub,24,GRAY,anchor='mm')
def arrow(d,a,b,label=''):
 d.line((a,b),fill=NAVY,width=3);ang=math.atan2(b[1]-a[1],b[0]-a[0]);v=[b,(b[0]-17*math.cos(ang-.45),b[1]-17*math.sin(ang-.45)),(b[0]-17*math.cos(ang+.45),b[1]-17*math.sin(ang+.45))];d.polygon(v,fill=NAVY)
 if label:txt(d,((a[0]+b[0])/2,(a[1]+b[1])/2-22),label,25,anchor='mm')
# 局部概念E-R图：矩形实体、菱形联系，主键下划线。
im,d=canvas(1600,700)
for xy,title,pk in [((40,240,280,360),'用户','user_id'),((510,240,790,360),'会话','conversation_id'),((1030,240,1310,360),'消息','message_id'),((1030,530,1310,650),'知识点','concept_id')]:
 box(d,xy,title);cx=(xy[0]+xy[2])/2;cy=xy[1]-80
 if title=='知识点':
  cx,cy=1460,590;d.ellipse((cx-125,cy-35,cx+125,cy+35),outline=NAVY,width=2);d.line((1310,cy,cx-125,cy),fill=NAVY,width=2)
 else:
  d.ellipse((cx-145,cy-35,cx+145,cy+35),outline=NAVY,width=2);d.line((cx,cy+35,cx,xy[1]),fill=NAVY,width=2)
 txt(d,(cx,cy),pk,25,anchor='mm');d.line((cx-95,cy+19,cx+95,cy+19),fill=NAVY,width=2)
def diamond(cx,cy,label):d.polygon([(cx-85,cy),(cx,cy-48),(cx+85,cy),(cx,cy+48)],outline=NAVY,fill='#f2f6fa',width=3);txt(d,(cx,cy),label,27,anchor='mm')
for cx,label in [(395,'拥有'),(910,'包含')]:diamond(cx,300,label)
d.line((280,300,310,300),fill=NAVY,width=3);d.line((480,300,510,300),fill=NAVY,width=3);d.line((790,300,825,300),fill=NAVY,width=3);d.line((995,300,1030,300),fill=NAVY,width=3)
for x,t in [(295,'1'),(495,'n'),(807,'1'),(1010,'n')]:txt(d,(x,266),t,27,TEAL,anchor='mm')
diamond(1170,445,'标注');d.line((1170,360,1170,397),fill=NAVY,width=3);d.line((1170,493,1170,530),fill=NAVY,width=3);txt(d,(1200,378),'m',27,TEAL);txt(d,(1200,502),'n',27,TEAL)
txt(d,(65,490),'标注联系映射为 message_concepts',30,b=True);txt(d,(65,545),'联合主键  message_id + concept_id',27);txt(d,(65,590),'属性  来源 / 状态 / 置信度',27)
txt(d,(800,42),'历史问答核心概念关系',39,b=True,anchor='mm');im.save(ASSET/'core-er.png')
# SQL流程图，两列同尺度。
im,d=canvas(1600,760);txt(d,(800,40),'知识点筛选的执行顺序调整',39,b=True,anchor='mm')
for x,title,steps in [(70,'原查询',['扫描本人的问题消息','连接每个问题的最新回答','逐组检查知识点标签','排序 计数 分页']),(870,'改写后',['按知识点筛选标签','映射问题并排除旧回复 去重','连接候选问答并组合其他条件','排序 计数 分页'])]:
 txt(d,(x+315,105),title,34,b=True,anchor='mm')
 for i,s in enumerate(steps):
  y=150+i*135;box(d,(x,y,x+630,y+85),s)
  if i<3:arrow(d,(x+315,y+86),(x+315,y+132))
txt(d,(800,730),'保持用户过滤 标签状态 最新回复 排序与分页语义',28,TEAL,anchor='mm');im.save(ASSET/'query-flow.png')
# 数据可视化，线性刻度，所有结果来自原始JSON。
r=json.loads((ROOT/'docs/sql/history-optimization.json').read_text(encoding='utf8'));cases=[]
for temp in ['cold','hot']:
 for c in [1,4]:
  pairs=[x for x in r['rows'] if x['temperature']==temp and x['role']=='kv_app' and x['concurrency']==c];cases.append((('冷门' if temp=='cold' else '热门')+'  并发'+str(c),next(x['p95'] for x in pairs if not x['optimized']),next(x['p95'] for x in pairs if x['optimized'])))
im,d=canvas(1600,830);txt(d,(70,45),'应用角色 kv_app 的 P95 延迟',40,b=True);txt(d,(70,110),'单位 ms   越低越好   含事务与 RLS 上下文',27,GRAY)
maxv=math.ceil(max(a for _,a,b in cases)/50)*50;left=330;right=1470;scale=(right-left)/maxv
for val in range(0,maxv+1,50):
 x=left+val*scale;d.line((x,180,x,730),fill='#dce3e9',width=2);txt(d,(x,762),str(val),25,GRAY,anchor='mm')
for i,(label,a,b) in enumerate(cases):
 y=210+i*135;txt(d,(55,y+30),label,29)
 for v,offset,color in [(a,0,BLUE),(b,48,TEAL)]:d.rectangle((left,y+offset,left+v*scale,y+offset+33),fill=color);txt(d,(left+v*scale+14,y+offset+16),f'{v:.2f}',25,color,anchor='lm')
d.rectangle((800,110,835,137),fill=BLUE);txt(d,(850,110),'原查询',26);d.rectangle((1100,110,1135,137),fill=TEAL);txt(d,(1150,110),'候选集改写',26);im.save(ASSET/'latency-p95.png')
# 截图仅裁切面板，保留原有内容，不重绘文字。
shots=ROOT/'docs/screenshots/acceptance-2026-11-17'
Image.open(shots/'09-history-combined.png').crop((418,169,1024,734)).save(ASSET/'history-filters.png')
Image.open(shots/'10-located.png').crop((420,306,1023,574)).save(ASSET/'located-message.png')
# Word版式。
doc=Document();sec=doc.sections[0];sec.page_width=Inches(8.5);sec.page_height=Inches(11);sec.top_margin=sec.bottom_margin=Inches(.65);sec.left_margin=sec.right_margin=Inches(.75)
for name in ['Normal','Body Text','Caption','Heading 1','Heading 2','Title']:
 st=doc.styles[name];st.font.name='Microsoft YaHei';st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Microsoft YaHei');st.font.size=Pt(11);st.font.color.rgb=RGBColor.from_string('222222');st.paragraph_format.space_after=Pt(7);st.paragraph_format.line_spacing=1.18
for name,size in [('Title',25),('Heading 1',20),('Heading 2',13)]:doc.styles[name].font.size=Pt(size);doc.styles[name].font.bold=True
# 清除模板潜在标题边框。
for name in ['Title','Subtitle']:
 pp=doc.styles[name]._element.find(qn('w:pPr'))
 if pp is not None:
  for el in list(pp):
   if el.tag==qn('w:pBdr'):pp.remove(el)
def para(t,b=False):
 p=doc.add_paragraph();rr=p.add_run(t);rr.bold=b;return p
def heading(t):doc.add_heading(t,1)
def pic(name,width=6.7):
 p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;run=p.add_run();run.add_picture(str(ASSET/name),width=Inches(width))
 inline=run._element.find('.//'+qn('wp:docPr'))
 if inline is not None:inline.set('descr',name)
def caption(t):p=doc.add_paragraph(t,'Caption');p.paragraph_format.space_after=Pt(10);p.runs[0].font.size=Pt(9)
def table(headers,rows,widths):
 t=doc.add_table(rows=1,cols=len(headers));t.autofit=False
 for c,w in zip(t.columns,widths):c.width=Inches(w)
 for c,v in zip(t.rows[0].cells,headers):c.text=v
 trPr=t.rows[0]._tr.get_or_add_trPr();repeat=OxmlElement('w:tblHeader');trPr.append(repeat)
 for row in rows:
  for c,v in zip(t.add_row().cells,row):c.text=str(v)
 for i,row in enumerate(t.rows):
  for cell,w in zip(row.cells,widths):
   cell.width=Inches(w)
   for p in cell.paragraphs:
    p.paragraph_format.space_before=Pt(4);p.paragraph_format.space_after=Pt(4)
    for run in p.runs:run.font.size=Pt(10);run.bold=(i==0)
   if i==0:
    shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'EAF0F5');cell._tc.get_or_add_tcPr().append(shade)
 return t
def speech(t):doc.add_heading('讲解要点',2);para(t)
def nextpage():doc.add_page_break()
doc.add_paragraph('KNOWVERSE 数据库阶段汇报','Title');para('历史问答的关系设计与查询优化',True);para('数据库系统概论课堂阶段汇报   2026年11月17日')
para('我们已实现历史问答的多条件检索和原消息定位。本次选取数据建模、一致性控制与知识点查询优化，说明已经完成的工作，以及下一阶段的验证计划。')
pic('history-filters.png',5.2);caption('图1 实际检索面板。关键词、日期和知识点可组合；截图来自演示模式的已验收流程。')
speech('先用这个页面说明业务问题：对话需要被持续积累，并能按时间和知识点找回。接下来解释支撑这一界面的数据库关系与查询。')
nextpage();heading('核心关系如何组织');pic('core-er.png');caption('图2 核心概念关系示意。矩形为实体，菱形为联系，下划线标识键；只展示本次汇报范围。')
table(['关系','保存的事实','设计理由'],[['conversations','一段会话及其用户归属','用户与会话一对多'],['messages','问题 回答 会话内顺序','会话内 seq 唯一，回答指向原问题'],['message_concepts','消息涉及哪些知识点','多对多拆成关联表，保留标签状态'],['material_chunks / message_citations','版本片段与具体引用','旧回答继续指向当时资料版本']],[1.7,2.2,2.9])
speech('一条消息可以关联多个知识点，一个知识点也会在多条消息中出现，因此采用关联表。资料引用绑定版本片段，资料更新不会让旧引用指向新内容。')
para('概念图与表结构分别承担业务解释和数据库实现的任务。完整局部 E-R 图保存在 docs/er/er-2-dialogue.png。')
nextpage();heading('规范化与受控冗余');para('消息表保留 user_id，方便本表的用户过滤与时间查询；它同时带来需要明确维护的冗余。',True)
table(['事实','结论'],[['候选键 id 与 (conversation_id, seq)','代理主键不能消除另一个组合候选键上的部分依赖'],['conversation_id 决定 user_id','相对组合候选键，user_id 只依赖其中一部分'],['复合外键 (conversation_id, user_id)','引用 conversations(id, user_id)，强制消息与会话归属一致']],[3.2,3.6])
doc.add_heading('引用摘录的口径修正',2);para('同一个资料片段可以被不同回答摘录不同句子。因此，chunk_id 并不唯一决定 quote；原“引用表因该依赖而只有1NF”的论证已撤回。新增测试在同一片段下保存两种合法摘录，验证这一业务反例。')
doc.add_heading('候选键目录的口径修正',2);para('目录现在区分最小非空唯一列组、可空 UNIQUE、部分或表达式唯一性，以及非最小超键。全库范式不能由索引数量自动推出，原全库46张BCNF的统计不再使用。')
speech('规范化分析要依据所有允许的业务状态。我们能清楚解释消息归属冗余，并用复合外键约束；对于尚未完成证明的关系，不发布笼统的最高范式结论。')
caption('依据：docs/schema/normalization-analysis.md、candidate-keys.md；tests/citation-fd.test.ts。')
nextpage();heading('知识点查询如何改写');pic('query-flow.png');caption('图3 SQL逻辑顺序示意，不代表所有数据分布下的固定物理执行计划。')
para('改写提前取得知识点对应的候选问答。在候选层处理问题标签和最新回复标签，再去重、连接问答，并组合关键词、日期和学科条件。没有新增索引或迁移。')
para('回归保留了用户隔离、拒绝标签排除、旧回复不误召回、多标签不重复，以及排序和分页语义。原查询保留为基准对照路径。')
speech('性能优化不能只看更快。我们先比较返回行、顺序和总数，再读执行计划；初稿在热门知识点下出现回退，修正重复匹配后才采用最终版本。')
nextpage();heading('同数据前后性能对照');pic('latency-p95.png');caption('图4 kv_app 角色的P95对照。数据来自 docs/sql/history-optimization.json；每组20次请求、预热2次。')
table(['场景','并发','原查询 ms','改写后 ms'],[[label.split('  ')[0],label[-1],f'{a:.2f}',f'{b:.2f}'] for label,a,b in cases],[2.2,.8,1.9,1.9])
para('条件：本机 PostgreSQL 16，4万条合成消息，两名模拟用户；每人冷门命中5组、热门命中3000组。计时包含连接获取、只读事务、RLS上下文和回滚，不含HTTP与浏览器。',False)
speech('冷门查询改善明显，热门并发4也有改善；热门单并发收益较小。固定测试顺序和小样本仍受缓存及系统负载影响，这些数字不作为线上性能承诺。')
nextpage();heading('验证结果与下一阶段');pic('located-message.png',6.5);caption('图5 实际定位原消息后的高亮状态，可在原会话继续提问。截图来自演示模式。')
para('验证：37个测试文件、250个用例通过，typecheck与生产build通过。基准包含owner和kv_app、冷热知识点、并发1与4共16组，并检查结果一致、无上下文0行及跨用户隔离。',True)
table(['已完成','接下来准备做','验证方式'],[['核心FD复核与键目录修正','继续核对可空来源关系的FD与归属约束','逐条说明适用条件，先检查历史数据'],['候选集改写与RLS基准','扩大数据规模和偏斜分布，补HTTP链路','比较结果 P50 P95 连接池等待'],['迁移与一致性检查','安排outbox消费监控与备份恢复演练','保留事件与恢复证据，不人为清空告警']],[2.0,2.7,2.1])
speech('下一阶段聚焦数据库论证与运行条件。我们已把一个真实慢查询完成优化，后续扩大规模、补全端到端测量，并逐步加强来源数据约束与运维验证。')
caption('复现：npm run bench 准备独立基准库；npm run bench:history 执行对照。完整证据见 docs/sql/history-optimization.md 与 docs/test-evidence/vitest-history-2026-11-17.json。')
# 页码便于课堂引用。
footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');footer._p.append(fld)
doc.core_properties.title='KNOWVERSE 数据库阶段汇报';doc.core_properties.author='';doc.core_properties.subject='历史问答关系设计 查询优化与后续计划'
doc.save(OUT);print(OUT)
