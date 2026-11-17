"""有主次的汇报ER：十五个真实关系实体，错位排布与独立走线，输出矢量及位图。"""
from pathlib import Path
import json,html,math
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/er/advanced'
T={t['name']:t for t in json.loads((OUT/'schema-metadata.json').read_text(encoding='utf8'))['tables']}
W,H=2240,1540;im=Image.new('RGB',(W,H),'#fcfcfd');d=ImageDraw.Draw(im)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', '<rect width="100%" height="100%" fill="#fcfcfd"/>']
NAVY='#22394d';GRAY='#62748a';BLUE='#467b9b';TEAL='#3f8b81';GOLD='#ad8151';PURPLE='#866ab0'
def font(n,b=False):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if b else 'C:/Windows/Fonts/msyh.ttc',n)
def rect(box,fill,stroke=None,r=18,width=2):
 d.rounded_rectangle(box,r,fill=fill,outline=stroke,width=width)
 x,y,x2,y2=box;svg.append(f'<rect x="{x}" y="{y}" width="{x2-x}" height="{y2-y}" rx="{r}" fill="{fill}" stroke="{stroke or fill}" stroke-width="{width}"/>')
def txt(x,y,t,n=26,color=NAVY,b=False):
 d.text((x,y),t,font=font(n,b),fill=color)
 svg.append(f'<text x="{x}" y="{y+n*.93}" font-family="Microsoft YaHei,sans-serif" font-size="{n}" font-weight="{700 if b else 400}" fill="{color}">{html.escape(t)}</text>')
def curve(points,color=BLUE,width=3):
 # 路径由三次Bezier段构成，同一几何同时用于PNG和SVG。
 p=points[0];path=f'M {p[0]} {p[1]}';pts=[p]
 for a,b,q in points[1:]:
  path+=f' C {a[0]} {a[1]}, {b[0]} {b[1]}, {q[0]} {q[1]}'
  for j in range(1,41):
   t=j/40;u=1-t;pts.append((u**3*p[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t**3*q[0],u**3*p[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t**3*q[1]))
  p=q
 d.line(pts,fill=color,width=width,joint='curve');svg.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{width}"/>')
def label(x,y,t,color=GRAY,n=22):
 tw=d.textlength(t,font=font(n));rect((x-4,y-2,x+tw+5,y+n+6),'#fcfcfd',r=5,width=0);txt(x,y,t,n,color)

txt(75,45,'学习事实如何保持可追溯',52,b=True)
txt(77,118,'KNOWVERSE  /  关系建模主图',26,GRAY)
txt(1350,66,'全库 55 表   106 外键   23 表启用 RLS',30,GRAY)
txt(1350,116,'本图精选 15 个实体与 15 条真实外键',25,GRAY)
for box,title,sub,color in [((60,220,660,1030),'01  知识来源','内容更新不改变历史引用',BLUE),((720,220,1450,1365),'02  问答与概念','联系实体承载引用与标注事实',TEAL),((1490,220,2190,1365),'03  训练与证据','事实  状态  成长历史分离',GOLD)]:
 rect(box,{'#467b9b':'#eef4f8','#3f8b81':'#f0f6f4','#ad8151':'#f7f3ee'}[color],r=30,width=0)
 txt(box[0]+25,box[1]-51,title,31,color,True);txt(box[0]+25,box[1]+15,sub,23,GRAY)

# 各节点有意错开，呈现版本链、联系桥和事实聚合，而非等宽卡片矩阵。
nodes={
 'materials':(105,295,315,130,'教学资料',BLUE,['PK id']),
 'material_versions':(160,520,365,155,'资料版本',BLUE,['PK id','UQ material_id + version_no']),
 'material_chunks':(275,810,330,155,'版本片段',BLUE,['PK id','UQ version_id + ord']),
 'conversations':(770,300,330,130,'问答会话',TEAL,['PK id']),
 'messages':(1055,535,345,155,'消息',TEAL,['PK id','归属 conversation_id + user_id']),
 'message_citations':(775,810,320,155,'引用联系',TEAL,['PK id','quote  /  ord']),
 'message_concepts':(1135,860,275,145,'消息概念联系',TEAL,['PK message_id + concept_id']),
 'concepts':(1125,1190,290,130,'知识点',TEAL,['PK id']),
 'learning_states':(765,1170,295,150,'当前学习状态',TEAL,['PK user_id + concept_id','stage  /  version']),
 'tasks':(1540,300,300,130,'题目身份',GOLD,['PK id']),
 'task_versions':(1845,535,300,155,'题目版本',GOLD,['PK id','UQ task_id + version_no']),
 'attempts':(1540,790,295,155,'学生作答',GOLD,['PK id','FK task_version_id']),
 'evaluations':(1890,990,275,130,'作答评价',GOLD,['UQ attempt_id']),
 'learning_evidence':(1510,1165,315,155,'学习证据',GOLD,['PK id','kind  /  revoked_at']),
 'growth_events':(1880,1215,280,130,'成长事件',GOLD,['FK evidence_id ?'])}

# label坐标逐条布局，避免把基数塞进结点或将交叉点误画成连接点。
edges=[
 ('material_versions','materials',[(230,520),((230,475),(262,475),(262,425))],(188,487),(279,443),BLUE),
 ('material_chunks','material_versions',[(425,810),((425,748),(343,737),(343,675))],(446,775),(295,696),BLUE),
 ('messages','conversations',[(1175,535),((1175,462),(1020,486),(1020,430))],(1190,498),(1036,449),PURPLE),
 ('message_citations','material_chunks',[(775,885),((705,885),(685,885),(605,885))],(725,850),(618,900),BLUE),
 ('message_citations','messages',[(935,810),((935,740),(1115,762),(1115,690))],(887,775),(1130,710),TEAL),
 ('message_concepts','messages',[(1272,860),((1272,800),(1272,750),(1272,690))],(1289,817),(1289,708),TEAL),
 ('message_concepts','concepts',[(1272,1005),((1272,1065),(1270,1120),(1270,1190))],(1288,1030),(1288,1150),TEAL),
 ('task_versions','tasks',[(1995,535),((1995,470),(1710,495),(1710,430))],(2010,493),(1727,449),GOLD),
 ('attempts','task_versions',[(1685,790),((1685,724),(1995,755),(1995,690))],(1640,754),(2010,710),GOLD),
 ('evaluations','attempts',[(1890,1050),((1860,1050),(1878,870),(1835,870))],(1850,1080),(1846,833),GOLD),
 ('learning_evidence','attempts',[(1670,1165),((1670,1090),(1685,1020),(1685,945))],(1610,1128),(1701,965),GOLD),
 ('growth_events','learning_evidence',[(1880,1270),((1850,1270),(1860,1240),(1825,1240))],(1835,1300),(1829,1201),GOLD),
 ('learning_states','concepts',[(1060,1250),((1080,1250),(1100,1250),(1125,1250))],(1061,1277),(1093,1210),TEAL),
 ('learning_evidence','concepts',[(1510,1250),((1480,1250),(1455,1250),(1415,1250))],(1465,1277),(1425,1210),GOLD),
 ('learning_evidence','messages',[(1510,1195),((1467,1195),(1468,1190),(1468,1150)),((1468,1010),(1468,870),(1468,755)),((1468,720),(1375,744),(1375,690))],(1470,1130),(1388,704),GOLD)]
for child,parent,points,cl,pl,color in edges:
 cons=[c for c in T[child]['constraints'] if c['type']=='f' and c['target'].replace('public.','')==parent];assert len(cons)==1,(child,parent)
 con=cons[0];mandatory=all(next(x for x in T[child]['columns'] if x['name']==col)['not_null'] for col in con['columns'])
 unique=[set(i['columns']) for i in T[child]['indexes'] if i['is_unique'] and i['valid'] and not i['predicate'] and not i['expression']]
 many=not any(k and k<=set(con['columns']) for k in unique)
 curve(points,color,4 if len(con['columns'])>1 else 3)
 label(*cl,'0..N' if many else '0..1',color);label(*pl,'1' if mandatory else '0..1',color)
for name,(x,y,w,h,title,color,attrs) in nodes.items():
 if len(attrs)>1:h=max(h,170)
 rect((x+3,y+6,x+w+3,y+h+6),'#e2e8ed',r=17,width=0)
 rect((x,y,x+w,y+h),'white','#c2cfd8',17,2)
 rect((x+16,y+21,x+22,y+49),color,r=3,width=0)
 txt(x+35,y+16,title,32,color,True)
 txt(x+18,y+59,name,23,GRAY)
 for i,a in enumerate(attrs):
  n=23
  while d.textlength(a,font=font(n))>w-35:n-=1
  txt(x+18,y+96+i*29,a,n,NAVY)

txt(95,1102,'为什么需要这些实体',29,BLUE,True)
for j,t in enumerate(['身份与版本分离，引用指向确定片段。','引用和标签都有自己的属性与唯一性。','评价可缺席，学习证据也可以撤销。','状态是用户与知识点之间的当前事实。']):txt(95,1161+46*j,t,25,GRAY)
txt(78,1420,'读图  端点数字表示最小与最大基数  紫线为复合外键  问号表示可空',26,NAVY)
txt(78,1470,'为保持可读性，省略公共用户归属及部分来源边。全库实体、完整外键和约束见配套八域图册。',25,GRAY)
assert len(nodes)==15 and len(edges)==15
svg.append('</svg>');(OUT/'03-learning-model.svg').write_text('\n'.join(svg),encoding='utf8');im.save(OUT/'03-learning-model.png')
print('主图已生成：15个实体，15条实际FK，SVG与PNG几何一致')
