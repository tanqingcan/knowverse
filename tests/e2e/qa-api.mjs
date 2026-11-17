/** 补充 QA：真实 HTTP + kv_app；仅允许本机，创建独立账号，不重置 demo、不调用模型。 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const base=process.env.BASE_URL ?? 'http://localhost:3000';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('QA 仅允许本机');
const checks=[];
const account=()=>({cookie:''});
async function request(session,path,body,form) {
 const r=await fetch(base+path,{method:body!==undefined||form?'POST':'GET',headers:{...(session.cookie?{Cookie:session.cookie}:{}),...(!form&&body!==undefined?{'Content-Type':'application/json'}:{})},body:form ?? (body===undefined?undefined:JSON.stringify(body))});
 const cookie=r.headers.get('set-cookie');if(cookie)session.cookie=cookie.split(';')[0];
 const json=await r.json();
 if(!r.ok||!json.ok)throw Error(`${path}: ${r.status} ${JSON.stringify(json.error)}`);
 return json.data;
}
async function check(id,fn){try{const detail=await fn();checks.push({id,ok:true,detail});console.log('✓',id,detail??'');}catch(e){checks.push({id,ok:false,error:e.message});console.log('✗',id,e.message);}}
const user=account(), outsider=account();
let subjects,concepts,left,cls,note;
try {
 await request(user,'/api/auth/register',{handle:'qa'+Date.now().toString(36),displayName:'交付验收',password:crypto.randomBytes(18).toString('base64url')});
 await request(outsider,'/api/auth/register',{handle:'qo'+Date.now().toString(36),displayName:'非成员验收',password:crypto.randomBytes(18).toString('base64url')});
 subjects=await request(user,'/api/subjects');concepts=await request(user,'/api/concepts');left=concepts.find(c=>c.name==='左外连接');
 await check('QA02 新账号开场 + 0031 默认时区',async()=>{
  assert.equal((await request(user,'/api/me')).user.timezone,'Asia/Shanghai');
  await request(user,'/api/onboarding',{planetName:'验收星',goalTitle:'理解 SQL 连接',subjectId:left.subjectId,conceptIds:[left.id],newConceptNames:[],natal:{conceptRef:left.id,species:'rose',color:'rose',nickname:'验收花'}});
  assert.equal((await request(user,'/api/space')).plants.length,1);return '星球、花圃和本命花已写入';
 });
 await check('QA06 TXT/MD/PDF/PPTX 上传',async()=>{
  const files=['概率统计习题说明.txt','C2-标题与长段落示例.md','条件概率讲义.pdf','C2-含备注的连接查询课件.pptx'];
  const states=[];
  for(const file of files){const form=new FormData();form.set('subjectId',left.subjectId);form.set('title','QA '+file);form.set('file',new Blob([await fs.readFile('seed/materials/'+file)]),file);const r=await request(user,'/api/materials',undefined,form);assert.equal(r.status,'ready');states.push(file+': ready');}
  return states;
 });
 await check('QA07/08 SQL、选择、数值判题',async()=>{
  const cases=[['左外连接','每位学生的本学期选课数',"SELECT s.name, COUNT(e.cid) AS n FROM students s LEFT JOIN enrollments e ON e.sid=s.sid AND e.term='2026秋' GROUP BY s.sid,s.name"],['事件的独立性','互斥与独立','B'],['条件概率','同时选两门课的概率','0.18']];
  for(const [conceptName,title,answer] of cases){const c=concepts.find(c=>c.name===conceptName);assert.ok(c);const r=await request(user,'/api/practice/suggest',{conceptId:c.id});const pick=r.picks.find(p=>p.title===title);assert.ok(pick,title);const a=await request(user,'/api/practice/start',{taskVersionId:pick.taskVersionId,mode:'guided'});const v=await request(user,`/api/attempts/${a.attempt.id}/submit`,{answer,submitKey:crypto.randomUUID()});assert.equal(v.evaluation.verdict,'correct',title);}
  return '三种题型均 correct（后端规则/沙箱判题）';
 });
 await check('QA09 笔记证据撤销',async()=>{
  note=await request(user,'/api/notes',{conceptId:left.id,title:'验收笔记',content:'右表条件放在 ON 中，可保留左表未匹配行。'});
  const g=await request(user,`/api/growth/${left.id}`);const ev=g.evidence.find(e=>e.noteId===note.noteId);assert.ok(ev);
  await request(user,`/api/evidence/${ev.id}/revoke`,{reason:'验收演示：撤销重复笔记'});
  assert.ok((await request(user,`/api/growth/${left.id}`)).evidence.find(e=>e.id===ev.id).revokedAt);return '证据保留撤销时间，成长按规则重算';
 });
 await check('QA10 时间轴/时间机器',async()=>{
  assert.ok((await request(user,'/api/timeline')).some(e=>e.eventType==='evidence_revoked'));
  const snapshot=await request(user,'/api/timeline/asof?at='+encodeURIComponent(new Date().toISOString()));assert.ok(snapshot);return '时间轴含撤销事件，as-of 返回当前快照';
 });
 await check('QA11 班级公开/未公开、非成员拒绝',async()=>{
  cls=await request(user,'/api/classes',{name:'QA 班级'});
  let denied=false;try{await request(outsider,`/api/classes/${cls.classId}/galaxy`);}catch(e){denied=/403/.test(e.message);}assert.ok(denied);
  await request(outsider,'/api/classes/join',{code:cls.joinCode});
  const hidden=await request(user,`/api/classes/${cls.classId}/galaxy`);assert.equal(hidden.hiddenCount,1);assert.equal(hidden.planets.length,1);
  await request(outsider,`/api/classes/${cls.classId}/sharing`,{sharePlanet:true});
  assert.equal((await request(user,`/api/classes/${cls.classId}/galaxy`)).planets.length,2);return '隐藏者不出现在列表，分享后出现；非成员 403';
 });
 await check('QA12 学习卡发布到班级',async()=>{
  const card=await request(user,'/api/cards',{conceptId:left.id,title:'LEFT JOIN 验收卡',body:'ON 筛选匹配，WHERE 筛选连接后的结果。',draftedBy:'user',sourceMessageIds:[]});
  await request(user,'/api/cards/publish',{versionId:card.versionId,classId:cls.classId});
  const cards=await request(outsider,`/api/classes/${cls.classId}/cards`);assert.ok(cards.some(c=>c.versionId===card.versionId));return '另一成员能读取发布的指定版本';
 });
} catch(e){checks.push({id:'setup',ok:false,error:e.message});console.error(e.message);}
await fs.mkdir('docs/test-evidence',{recursive:true});
await fs.writeFile('docs/test-evidence/qa-api-2026-11-17.json',JSON.stringify({at:new Date().toISOString(),mode:'demo / HTTP / kv_app / 独立验收账号',checks},null,2)+'\n');
process.exitCode=checks.every(c=>c.ok)?0:1;
