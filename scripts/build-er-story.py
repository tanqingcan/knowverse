"""汇报用Chen概念ER：矩形实体、菱形联系、椭圆属性、下划线键、双线全参与与ISA。"""
from pathlib import Path
import json,html,re,math
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/er/advanced'
T={t['name']:t for t in json.loads((OUT/'schema-metadata.json').read_text(encoding='utf8'))['tables']}
W,H=2800,1900;BG='#fcfcfd';im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',f'<rect width="100%" height="100%" fill="{BG}"/>']
NAVY='#243c50';GRAY='#62748a';BLUE='#467b9b';TEAL='#43877e';GOLD='#a57b4b'
def font(n,b=False):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if b else 'C:/Windows/Fonts/msyh.ttc',n)
def rect(box,fill,stroke=None,r=0,width=2):
 d.rounded_rectangle(box,r,fill=fill,outline=stroke,width=width);x,y,x2,y2=box
 svg.append(f'<rect x="{x}" y="{y}" width="{x2-x}" height="{y2-y}" rx="{r}" fill="{fill}" stroke="{stroke or fill}" stroke-width="{width}"/>')
def txt(x,y,t,n=26,color=NAVY,b=False,center=False,under=False):
 if center:x-=d.textlength(t,font=font(n,b))/2
 d.text((x,y),t,font=font(n,b),fill=color)
 if under:
  bb=d.textbbox((x,y),t,font=font(n,b));d.line((bb[0],bb[3]+3,bb[2],bb[3]+3),fill=color,width=2)
 deco=' text-decoration="underline"' if under else ''
 svg.append(f'<text x="{x}" y="{y+n*.93}" font-family="Microsoft YaHei,sans-serif" font-size="{n}" font-weight="{700 if b else 400}" fill="{color}"{deco}>{html.escape(t)}</text>')
def line(points,color=GRAY,double=False,width=3):
 def single(ps):
  d.line(ps,fill=color,width=width,joint='curve');svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in ps)+f'" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"/>')
 if not double:single(points);return
 # 平行偏移各段，再求相邻直线交点，保留清楚的双线折角。
 for offset in [-4,4]:
  seg=[]
  for (x,y),(u,v) in zip(points,points[1:]):
   z=math.hypot(u-x,v-y);nx=-(v-y)/z*offset;ny=(u-x)/z*offset;seg.append(((x+nx,y+ny),(u+nx,v+ny)))
  ps=[seg[0][0]]
  for (p,q),(r,s) in zip(seg,seg[1:]):
   a,b=q[0]-p[0],q[1]-p[1];c,e=s[0]-r[0],s[1]-r[1];den=a*e-b*c
   if abs(den)<1e-8:ps.append(q)
   else:
    t=((r[0]-p[0])*e-(r[1]-p[1])*c)/den;ps.append((p[0]+t*a,p[1]+t*b))
  ps.append(seg[-1][1]);single(ps)
def card(x,y,t,color):
 tw=d.textlength(t,font=font(25));rect((x-5,y-3,x+tw+6,y+34),BG,r=4,width=0);txt(x,y,t,25,color)
def ellipse(owner,column,cx,cy,w,label,key=False,color=GRAY):
 assert column in {c['name'] for c in T[owner]['columns']},(owner,column)
 if key:assert column in next(c['columns'] for c in T[owner]['constraints'] if c['type']=='p')
 h=58;box=(cx-w/2,cy-h/2,cx+w/2,cy+h/2);d.ellipse(box,fill='white',outline=color,width=2)
 svg.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{w/2}" ry="{h/2}" fill="white" stroke="{color}" stroke-width="2"/>');txt(cx,cy-17,label,26,color,center=True,under=key)
def diamond(cx,cy,label,color,w=160,h=100):
 pts=[(cx-w/2,cy),(cx,cy-h/2),(cx+w/2,cy),(cx,cy+h/2)];d.polygon(pts,fill='white',outline=color,width=3)
 svg.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in pts)+f'" fill="white" stroke="{color}" stroke-width="3"/>');txt(cx,cy-18,label,26 if len(label)>3 else 29,color,b=True,center=True)

txt(75,40,'学习事实的可追溯概念模型',55,b=True);txt(78,123,'KNOWVERSE  /  Chen 实体联系图',29,GRAY)
txt(1710,58,'全库 55 表   106 外键   23 表启用 RLS',34,GRAY);txt(1710,120,'主图 13 个实体  12 个联系  关键属性节选',28,GRAY)
for box,title,sub,color,fill in [((60,265,790,1360),'01  知识来源','内容身份与内容版本分离',BLUE,'#eff5f8'),((850,265,1810,1790),'02  问答与概念','引用 标注与当前状态是带属性的联系',TEAL,'#f0f6f4'),((1870,265,2740,1790),'03  训练与证据','作答 评价 证据与成长各自建模',GOLD,'#f8f4ef')]:
 rect(box,fill,r=25,width=0);txt(box[0]+25,185,title,33,color,True);txt(box[0]+25,235,sub,25,GRAY)
# 13个实体均映射到真实关系；关联表在概念层还原为带属性的联系。
nodes={
 'materials':(170,405,450,495,'教学资料',BLUE),
 'material_versions':(300,805,580,895,'资料版本',BLUE),
 'material_chunks':(430,1215,710,1305,'资料片段',BLUE),
 'conversations':(910,405,1210,495,'问答会话',TEAL),
 'messages':(1290,760,1600,850,'消息',TEAL),
 'concepts':(1330,1420,1630,1510,'知识点',TEAL),
 'users':(910,1590,1190,1680,'用户',TEAL),
 'tasks':(1970,405,2270,495,'题目身份',GOLD),
 'task_versions':(2350,760,2650,850,'题目版本',GOLD),
 'attempts':(1960,1050,2240,1140,'学生作答',GOLD),
 'evaluations':(2460,1260,2710,1350,'作答评价',GOLD),
 'learning_evidence':(1960,1430,2250,1520,'学习证据',GOLD),
 'growth_events':(2460,1560,2710,1650,'成长事件',GOLD)}
# 每个role给出实体端到菱形端的路径；1/N为最大基数，双线表示该实体全部参与。
rels=[
 ('资料版本化',(360,650,'版本',BLUE), [('materials','1',[(310,495),(310,560),(360,560),(360,600)],(275,520),False),('material_versions','N',[(440,805),(440,745),(360,745),(360,700)],(455,765),True)],('material_versions','materials')),
 ('版本分块',(480,1070,'分块',BLUE), [('material_versions','1',[(440,895),(440,970),(480,970),(480,1020)],(400,925),False),('material_chunks','N',[(570,1215),(570,1160),(480,1160),(480,1120)],(585,1170),True)],('material_chunks','material_versions')),
 ('会话组成',(1200,620,'包含',TEAL), [('conversations','1',[(1060,495),(1060,540),(1200,540),(1200,570)],(1020,510),False),('messages','N',[(1445,760),(1445,710),(1200,710),(1200,670)],(1460,723),True)],('messages','conversations')),
 ('引用',(1040,1130,'引用',TEAL), [('messages','M',[(1290,805),(1210,805),(1210,1030),(1040,1030),(1040,1080)],(1248,820),False),('material_chunks','N',[(710,1260),(830,1260),(830,1130),(960,1130)],(735,1275),False)],'message_citations'),
 ('标注',(1480,1100,'标注',TEAL), [('messages','M',[(1445,850),(1445,960),(1480,960),(1480,1050)],(1400,890),False),('concepts','N',[(1480,1420),(1480,1150)],(1495,1372),False)],'message_concepts'),
 ('题目版本化',(2330,620,'修订',GOLD), [('tasks','1',[(2120,495),(2120,540),(2330,540),(2330,570)],(2080,510),False),('task_versions','N',[(2500,760),(2500,710),(2330,710),(2330,670)],(2515,723),True)],('task_versions','tasks')),
 ('作答对象',(2290,970,'针对',GOLD), [('task_versions','1',[(2350,805),(2290,805),(2290,920)],(2303,820),False),('attempts','N',[(2240,1095),(2290,1095),(2290,1020)],(2250,1110),True)],('attempts','task_versions')),
 ('作答评价',(2390,1165,'得到',GOLD), [('attempts','1',[(2240,1095),(2310,1095),(2310,1165)],(2250,1060),False),('evaluations','1',[(2460,1305),(2390,1305),(2390,1215)],(2420,1318),True)],('evaluations','attempts')),
 ('作答证据',(2105,1285,'产生',GOLD), [('attempts','1',[(2100,1140),(2100,1235)],(2118,1168),False),('learning_evidence','N',[(2105,1430),(2105,1335)],(2122,1388),False)],('learning_evidence','attempts')),
 ('证据主题',(1790,1475,'关于',GOLD), [('concepts','1',[(1630,1465),(1670,1465),(1670,1475),(1710,1475)],(1640,1425),False),('learning_evidence','N',[(1960,1475),(1870,1475)],(1900,1435),True)],('learning_evidence','concepts')),
 ('成长依据',(2380,1480,'依据',GOLD), [('learning_evidence','1',[(2250,1475),(2300,1475),(2300,1480)],(2260,1435),False),('growth_events','N',[(2585,1560),(2585,1480),(2460,1480)],(2600,1520),False)],('growth_events','learning_evidence')),
 ('当前状态',(1320,1640,'当前状态',TEAL), [('users','M',[(1190,1635),(1240,1635),(1240,1640)],(1195,1600),False),('concepts','N',[(1480,1510),(1480,1570),(1400,1570),(1400,1640)],(1495,1530),False)],'learning_states')]
for key,(cx,cy,name,color),roles,mapping in rels:
 if isinstance(mapping,tuple):
  child,parent=mapping;cons=[c for c in T[child]['constraints'] if c['type']=='f' and c['target'].replace('public.','')==parent];assert len(cons)==1,mapping
  con=cons[0];mandatory=all(next(x for x in T[child]['columns'] if x['name']==col)['not_null'] for col in con['columns'])
  unique=[set(i['columns']) for i in T[child]['indexes'] if i['is_unique'] and i['valid'] and not i['predicate'] and not i['expression']]
  expected='1' if any(k and k<=set(con['columns']) for k in unique) else 'N'
  for entity,cardinality,path,pos,total in roles:
   if entity==child:
    assert total==mandatory,(key,'全参与与NOT NULL不一致')
    assert cardinality==expected,(key,'基数与唯一性不一致')
 else:
  refs={c['target'].replace('public.','') for c in T[mapping]['constraints'] if c['type']=='f'};assert {r[0] for r in roles}<=refs
  pair={col for c in T[mapping]['constraints'] if c['type']=='f' for col in c['columns']}
  assert any(i['is_unique'] and i['valid'] and not i['predicate'] and not i['expression'] and set(i['columns'])<=pair for i in T[mapping]['indexes']),'同一实体对不应有重复联系实例'
 for entity,cardinality,path,pos,total in roles:line(path,color,total);card(*pos,cardinality,color)
 diamond(cx,cy,name,color)
for table,(x,y,x2,y2,title,color) in nodes.items():
 assert table in T;rect((x,y,x2,y2),'white',color,width=3);txt((x+x2)/2,y+10,title,34,color,True,True);txt((x+x2)/2,y+54,table,23,GRAY,center=True)
# 关键键属性（下划线）及联系属性均经目录字段验证。
attrs=[
 ('materials','id',310,305,190,'资料ID',True,[(310,334),(310,405)]),
 ('materials','title',600,450,180,'标题',False,[(450,450),(510,450)]),
 ('material_versions','id',670,750,190,'版本ID',True,[(530,805),(575,750)]),
 ('material_versions','version_no',145,850,180,'版本号',False,[(235,850),(300,850)]),
 ('material_chunks','id',270,1260,195,'片段ID',True,[(367,1260),(430,1260)]),
 ('conversations','id',1060,305,200,'会话ID',True,[(1060,334),(1060,405)]),
 ('messages','id',1645,650,200,'消息ID',True,[(1560,760),(1645,679)]),
 ('messages','role',1720,900,170,'角色',False,[(1600,805),(1635,900)]),
 ('concepts','id',1690,1380,195,'知识点ID',True,[(1630,1445),(1690,1409)]),
 ('users','id',960,1480,180,'用户ID',True,[(960,1509),(1000,1590)]),
 ('tasks','id',2120,305,190,'题目ID',True,[(2120,334),(2120,405)]),
 ('task_versions','id',2570,650,200,'题目版本ID',True,[(2590,760),(2570,679)]),
 ('attempts','id',2070,960,190,'作答ID',True,[(2070,989),(2070,1050)]),
 ('learning_evidence','id',2010,1630,195,'证据ID',True,[(2010,1601),(2050,1520)]),
 ('learning_evidence','revoked_at',2260,1660,220,'撤销时间',False,[(2260,1631),(2200,1520)]),
 ('growth_events','id',2590,1750,190,'事件ID',True,[(2590,1721),(2585,1650)]),
 ('message_citations','quote',1040,1300,200,'摘录 quote',False,[(1040,1271),(1040,1180)]),
 ('message_citations','ord',1110,1430,180,'引用顺序',False,[(1200,1430),(1240,1430),(1240,1130),(1120,1130)]),
 ('message_concepts','confidence',1695,1100,210,'置信度',False,[(1580,1100),(1560,1100)]),
 ('message_concepts','status',1700,1240,185,'确认状态',False,[(1607,1240),(1580,1240),(1580,1130),(1530,1120)]),
 ('learning_states','stage',1320,1750,210,'掌握阶段',False,[(1320,1721),(1320,1690)])]
for owner,col,x,y,w,label,key,path in attrs:line(path,'#9aaab5',width=2);ellipse(owner,col,x,y,w,label,key)
# role的非空二值CHECK支持互斥且完全的概念特化，物理层仍为单表。
role_check=next(c['definition'] for c in T['messages']['constraints'] if c['name']=='messages_role_ck')
assert set(re.findall(r"'([^']+)'",role_check))=={'user','assistant'}
assert next(c for c in T['messages']['columns'] if c['name']=='role')['not_null']
txt(85,1395,'ISA 局部展开',30,BLUE,True)
rect((350,1440,550,1500),'white',BLUE,width=3);txt(450,1457,'消息',29,BLUE,True,True)
line([(450,1500),(450,1520)],BLUE,True)
tri=[(450,1520),(385,1600),(515,1600)];d.polygon(tri,fill='white',outline=BLUE,width=3);svg.append('<polygon points="450,1520 385,1600 515,1600" fill="white" stroke="'+BLUE+'" stroke-width="3"/>');txt(450,1554,'ISA',25,BLUE,True,True)
for box,title,role in [((110,1660,350,1730),'用户消息','role = user'),((470,1660,710,1730),'助手消息','role = assistant')]:
 cx=(box[0]+box[2])/2;line([(450,1600),(450,1630),(cx,1630),(cx,1660)],BLUE);rect(box,'white',BLUE,width=3);txt(cx,box[1]+5,title,27,BLUE,True,True);txt(cx,box[1]+39,role,22,GRAY,center=True)
txt(85,1750,'互斥 完全特化  沿用同一 messages 表',24,GRAY)
txt(78,1820,'读图  矩形 实体    菱形 联系    椭圆 属性    下划线 键属性    双线 全参与    1 M N 最大基数',28,NAVY)
txt(78,1867,'概念图节选：引用 标注 当前状态分别映射为关联表；ISA为消息角色分类。其他属性与全库关系见配套逻辑图册。',25,GRAY)
assert len(nodes)==13 and len(rels)==12
svg.append('</svg>');(OUT/'03-learning-model.svg').write_text('\n'.join(svg),encoding='utf8');im.save(OUT/'03-learning-model.png')
manifest={'notation':'Chen + ISA','entities':13,'relationships':12,'attributes':len(attrs),'isa':{'supertype':'messages','subtypes':['user','assistant'],'disjoint':True,'total':True,'physical_mapping':'single table messages.role'},'relationships_mapping':[{'name':key,'mapping':mapping,'entity_roles':[{'entity':e,'max':c,'total_participation':total} for e,c,path,pos,total in roles]} for key,shape,roles,mapping in rels]}
(OUT/'conceptual-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Chen主图：13实体 12菱形联系 21椭圆属性 ISA互斥完全特化，映射检查通过')
