"""由目录快照生成全库/分域逻辑ER图；不推断不存在的外键。需要Graphviz与Pillow。"""
from pathlib import Path
import json,subprocess,html,os,shutil
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/er/advanced';OUT.mkdir(exist_ok=True)
DATA=json.loads((OUT/'schema-metadata.json').read_text(encoding='utf8'));TABLES={t['name']:t for t in DATA['tables']}
GROUPS={
 'identity':('身份与访问','#516a87',['users','auth_sessions']),
 'knowledge':('知识目录与学习目标','#4a7e77',['subjects','concepts','concept_aliases','concept_prerequisites','learning_goals','goal_concepts']),
 'world':('星球与布局','#6c8054',['planets','gardens','plants','garden_knowledge_places','planet_layouts','planet_layout_items']),
 'dialogue':('问答 检索与记忆','#6c6692',['conversations','messages','message_concepts','message_terms','model_calls','concept_suggestions','memories','memory_controls','conversation_summaries']),
 'materials':('资料版本 引用与笔记','#507a9b',['materials','material_versions','material_chunks','material_concepts','material_chunk_concepts','material_chunk_embeddings','message_citations','notes']),
 'practice':('题目 作答与成长证据','#9b7350',['tasks','task_concepts','task_versions','task_hints','attempts','hint_events','evaluations','learning_evidence','learning_states','growth_events']),
 'collaboration':('班级 共学与知识发布','#997185',['classes','class_members','sharing_preferences','learning_intents','study_groups','study_group_members','contributions','knowledge_cards','card_versions','card_sources','card_publications','class_stats']),
 'operations':('审计 事件与CDC','#677482',['audit_log','outbox_events','cdc_consumed','cdc_offsets'])}
CN=dict(zip(['users','auth_sessions','subjects','concepts','concept_aliases','concept_prerequisites','learning_goals','goal_concepts','planets','gardens','plants','garden_knowledge_places','planet_layouts','planet_layout_items','conversations','messages','message_concepts','message_terms','model_calls','concept_suggestions','memories','memory_controls','conversation_summaries','materials','material_versions','material_chunks','material_concepts','message_citations','notes','tasks','task_concepts','task_versions','task_hints','attempts','hint_events','evaluations','learning_evidence','learning_states','growth_events','classes','class_members','sharing_preferences','learning_intents','study_groups','study_group_members','contributions','knowledge_cards','card_versions','card_sources','card_publications','class_stats','audit_log','outbox_events','cdc_consumed','cdc_offsets'],['用户','认证会话','学科','知识点','概念别名','先修关系','学习目标','目标路线','个人星球','学科花圃','知识植物','知识地点','布局草稿与发布','布局实例','问答会话','消息','消息标签','倒排词项','模型调用','概念建议','学习记忆','记忆修订控制','会话摘要','教学资料','资料版本','资料片段','版本概念','消息引用','学习笔记','题目身份','考查知识点','题目版本','版本提示','作答','提示查看','评价','学习证据','当前学习状态','成长事件','班级','班级成员','分享偏好','学习意愿','共学小组','小组成员','贡献','学习卡身份','卡片版本','卡片来源','班级发布','班级统计','分区审计','事务事件箱','CDC消费幂等','CDC位点']))
CN.update(material_chunk_concepts='片段知识点', material_chunk_embeddings='片段向量')
OWNER={n:k for k,v in GROUPS.items() for n in v[2]};assert set(OWNER)==set(TABLES),(set(TABLES)-set(OWNER),set(OWNER)-set(TABLES))
assert sum(len(v[2]) for v in GROUPS.values())==len(TABLES),'一个表只能归入一个业务域'
# 标题统计随目录快照更新，禁止写死图中规模。
COUNTS={'tables':len(TABLES),'foreign_keys':sum(c['type']=='f' for t in TABLES.values() for c in t['constraints']),'rls':sum(t['rls'] for t in TABLES.values()),'triggers':sum(len(t['triggers']) for t in TABLES.values())}
DOT=os.environ.get('GRAPHVIZ_DOT') or shutil.which('dot') or r'D:/Program Files/Graphviz/bin/dot.exe'
def esc(s):return html.escape(str(s),quote=True)
def unique_sets(t):return [set(i['columns']) for i in t['indexes'] if i['is_unique'] and i['valid'] and not i['predicate'] and not i['expression']]
def fields(t):
 pk=set(next(c['columns'] for c in t['constraints'] if c['type']=='p'));fk={x for c in t['constraints'] if c['type']=='f' for x in c['columns']}
 # 所有PK/FK列完整显示，另列两个业务属性，其余保留在快照。
 cols=[c for c in t['columns'] if c['name'] in pk|fk];extra=[c for c in t['columns'] if c['name'] not in pk|fk][:2]
 return pk,fk,cols+extra

def node(name,context=False,compact=False):
 t=TABLES[name];group=GROUPS[OWNER[name]];color='#85909e' if context else group[1];pk,fk,cols=fields(t)
 badges=(' · RLS' if t['rls'] else '')+(' · 分区' if t['kind']=='p' else '')
 rows=[f'<TR><TD COLSPAN="3" BGCOLOR="{color}"><FONT COLOR="white"><B>{esc(CN[name])}</B> {esc(badges)}</FONT></TD></TR>',f'<TR><TD COLSPAN="3"><B>{name}</B></TD></TR>']
 if compact:
  rows.append('<TR><TD COLSPAN="3" ALIGN="LEFT">PK '+esc(', '.join(sorted(pk)))+'</TD></TR>')
 else:
  for c in cols:
   flag=('PK ' if c['name'] in pk else '')+('FK' if c['name'] in fk else '')
   dtype=c['type'].replace('timestamp with time zone','timestamptz').replace('character varying','varchar')
   rows.append(f'<TR><TD>{flag}</TD><TD PORT="{c["name"]}" ALIGN="LEFT">{esc(c["name"])}</TD><TD ALIGN="LEFT">{esc(dtype)} {"!" if c["not_null"] else "?"}</TD></TR>')
  if len(cols)<len(t['columns']):rows.append(f'<TR><TD COLSPAN="3" ALIGN="LEFT"><FONT COLOR="#697787">另有{len(t["columns"])-len(cols)}个属性 见目录快照</FONT></TD></TR>')
  uqs=[i for i in t['indexes'] if i['is_unique'] and not i['is_primary']]
  for i in uqs[:2]:
   line=('条件UQ ' if i['predicate'] else 'UQ ')+','.join(i['columns'])
   rows.append(f'<TR><TD COLSPAN="3" ALIGN="LEFT"><FONT POINT-SIZE="10">{esc(line)}</FONT></TD></TR>')
  tags=[]
  if t['triggers']:tags.append(f'{len(t["triggers"])} 触发器')
  ck=sum(c['type']=='c' for c in t['constraints'])
  if ck:tags.append(f'{ck} CHECK')
  if tags:rows.append('<TR><TD COLSPAN="3" ALIGN="LEFT">'+esc(' / '.join(tags))+'</TD></TR>')
 return f'"{name}" [shape=plain label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5" BGCOLOR="white" COLOR="{color}">'+''.join(rows)+'</TABLE>>];'

def edges(selected,compact=False):
 result=[]
 for name in selected:
  t=TABLES[name]
  for con in t['constraints']:
   target=con['target'].replace('public.','')
   if con['type']!='f' or target not in selected:continue
   mandatory=all(next(c for c in t['columns'] if c['name']==col)['not_null'] for col in con['columns'])
   head='1' if mandatory else '0..1';tail='0..1' if any(k<=set(con['columns']) for k in unique_sets(t)) else '0..N'
   composite=len(con['columns'])>1;color='#77519c' if composite else '#8b98a7'
   # 接到实体外边界，避免连线穿过字段文字；完整列对应关系放在SVG tooltip及快照。
   port='';dest=''
   label='复合归属FK' if composite else (con['columns'][0] if name==target else '')
   result.append(f'"{name}"{port} -> "{target}"{dest} [dir=none color="{color}" penwidth={2 if composite else 1.1} headlabel="{head}" taillabel="{tail}" label="{label}" tooltip="{esc(con["definition"])}"];')
 return result

def render(name,title,selected,focus=None,compact=False):
 lines=['digraph G {',f'graph [rankdir=LR, bgcolor="white", pad="0.35", nodesep="0.40", ranksep="0.80", splines=polyline, overlap=false, outputorder=edgesfirst, fontname="Microsoft YaHei", fontsize=23, label="{title}", labelloc=t];','node [fontname="Microsoft YaHei",fontsize=12]; edge [fontname="Microsoft YaHei",fontsize=10,labelfontsize=10,labeldistance=1.6];']
 if focus is None:
  for key,(label,color,names) in GROUPS.items():
   actual=[n for n in names if n in selected]
   lines.append(f'subgraph cluster_{key} {{ label="{label}  {len(actual)}表";color="{color}";style="rounded";penwidth=2;')
   lines.extend(node(n,compact=compact) for n in actual);lines.append('}')
 else:
  lines.extend(node(n,context=n not in focus,compact=compact) for n in selected)
 lines.extend(edges(selected,compact));lines.append('}')
 path=OUT/(name+'.dot');path.write_text('\n'.join(lines),encoding='utf8')
 for fmt in ['svg','png']:
  subprocess.run([DOT,'-T'+fmt,'-Gdpi=120',str(path),'-o',str(OUT/(name+'.'+fmt))],check=True,timeout=90)
 print(name,Image.open(OUT/(name+'.png')).size,'entities',len(selected),'foreign keys',len(edges(selected)))

# 全库实际外键。缩略图只显示PK，字段级关系见分域和JSON。
render('01-full-schema',f"KNOWVERSE 全库逻辑ER  {COUNTS['tables']}表 / {COUNTS['foreign_keys']}外键 / {COUNTS['rls']}表RLS",list(TABLES),compact=True)
# 每个分域保留域内所有关系，跨域只引入直接被引用的上下文，不递归展开。
for key,(label,color,names) in GROUPS.items():
 refs={c['target'].replace('public.','') for n in names for c in TABLES[n]['constraints'] if c['type']=='f'}
 selected=names+sorted((refs-set(names))&set(TABLES))
 render('detail-'+key,label+'  字段级逻辑ER',selected,focus=set(names))
# 讲解用结构视图：保留六个核心链路的实际外键，不绘制用户归属等重复支线。
focus=['conversations','messages','message_concepts','message_terms','model_calls','memories','conversation_summaries','materials','material_versions','material_chunks','message_citations','tasks','task_versions','attempts','evaluations','learning_evidence','learning_states','growth_events','classes','class_members','sharing_preferences','study_groups','study_group_members','contributions','knowledge_cards','card_versions','card_publications']
render('02-core-cross-domain','核心跨域关系  版本引用 / 证据成长 / 班级发布',focus,focus=set(focus),compact=True)
# 八个领域的总览，列出全部表与跨域FK数量（不是把聚合边冒充实体关系）。
from collections import Counter
links=Counter((OWNER[t['name']],OWNER[c['target'].replace('public.','')]) for t in TABLES.values() for c in t['constraints'] if c['type']=='f' and c['target'].replace('public.','') in OWNER and OWNER[t['name']]!=OWNER[c['target'].replace('public.','')])
readme=['# KNOWVERSE 真实关系建模图册','',f'元数据：{COUNTS["tables"]} 个逻辑表、{COUNTS["foreign_keys"]} 条外键、{COUNTS["rls"]} 张表启用 RLS、{COUNTS["triggers"]} 个用户触发器。排除分区子表与视图；不把业务关联、触发器依赖当作额外FK。','', '## 读图约定','','- 概念图采用 Chen 表示法，矩形为实体，菱形为联系，椭圆为属性，下划线为键属性，1/M/N 为最大基数，双线为全参与。','- ISA 展开图区分用户消息与助手消息，单表以 messages.role 映射。版本和片段在主图中有全局键。','- 全库图是逻辑ER（表级），不是教材Chen概念图；原教材风格概念图保留在父目录。','- 连线从子表指向父表；父端1表示此FK列均非空，0..1表示可空。子端0..N或0..1由完整唯一性约束判断。不把可空字段画成强制参与。','- 紫色线为复合FK；灰色实体为当前分域引用的外部上下文。!为NOT NULL，?为可空。','- PK为主键，UQ为唯一性；条件UQ只在部分谓词下有效，不冒充全局候选键。RLS表示数据库已启用行安全，不代表所有表都受RLS管理。','- 版本表含代理主键及父实体+版本号的自然唯一性；不因一个CASCADE外键就把表标成弱实体。','- CDC消费event_id、outbox.aggregate_id、审计row_pk可能按业务关联，但没有真实FK时不画实线。','- 1:1只说明最大基数，默认不推导父对象一定存在子对象；例如一次作答可以暂时没有评价。','','## 领域与文件','','|领域|实体数|字段级图|','|---|---:|---|']
for k,(label,color,names) in GROUPS.items():readme.append(f'|{label}|{len(names)}|[SVG](detail-{k}.svg) / [PNG](detail-{k}.png)|')
readme+=['',f'[全库 {COUNTS["tables"]} 表 SVG](01-full-schema.svg) · [核心跨域SVG](02-core-cross-domain.svg)','','## 讲解的高级建模点','','1. 消息标签、版本概念、题目考查、班级成员和卡片发布均以关联实体实现多对多，属性属于联系事实。','2. 资料/题目/学习卡的身份与不可变版本分离，引用和作答绑定具体版本；三条链复用同一版本化思想。','3. 证据与当前状态分离，撤销时间保留历史；当前学习状态是(user_id,concept_id)汇总，成长事件负责时序记录。','4. sharing_preferences、learning_intents通过复合成员FK，contributions通过复合小组成员FK，将成员资格放进数据库约束。','5. memories.corrects_id与messages.reply_to_id是自关联；concept_prerequisites是带角色的自反多对多，防环由触发器负责。','6. 图中FK不能表达所有规则：名额并发、先修防环、本命花归属、状态重放与RLS分别由约束/触发器/函数/策略承担，详见迁移与测试。','','## 校验与复现','','`npx tsx scripts/export-er-metadata.ts`只读更新系统目录快照；使用bundled Python运行`scripts/build-advanced-er.py`生成SVG/PNG/DOT。元数据不包含业务行或密钥。','',f'全库覆盖校验：{len(TABLES)}表，每表恰好归属一个领域；完整图边数{len(edges(list(TABLES),True))}与FK目录一致。完整字段、CHECK、索引谓词、触发器定义见[schema-metadata.json](schema-metadata.json)。']
readme[2:2]=['[汇报主图 SVG](03-learning-model.svg) / [PNG](03-learning-model.png)：教材Chen概念ER，13个实体、12个菱形联系、21个椭圆属性及消息角色ISA特化，分域错位布局。主图由`scripts/build-er-story.py`生成；关系映射见[conceptual-manifest.json](conceptual-manifest.json)。全库逻辑图用于覆盖核对，字段级图用于深入查阅。','','迁移 0032 的片段知识点和持久向量位于资料域。详见 [教材检索设计](../../retrieval.md)。','']
(OUT/'README.md').write_text('\n'.join(readme)+'\n',encoding='utf8')
(OUT/'diagram-manifest.json').write_text(json.dumps({**COUNTS,'groups':{k:v[2] for k,v in GROUPS.items()},'cross_domain_fk_counts':[{'from':a,'to':b,'count':n} for (a,b),n in links.items()]},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
