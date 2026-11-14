import './env';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pool,q1} from '../src/db';
import {searchMaterials} from '../src/server/materials';
import {searchMaterialsBaseline} from './eval-legacy-retrieval';
import {chatCompletion,extractJson} from '../src/server/agent/llm';
import {SYSTEM_PROMPT,AgentAnswer,renderContext,type RefMaterial} from '../src/server/agent/prompts';
import {checkAndRepairCitations,CITATION_REPAIR_PROMPT} from '../src/server/retrieval/repair';
const topics=[
 {topic:'LEFT JOIN 保留左表全部元组',subject:'dbms',gold:['左','NULL']},
 {topic:'INNER JOIN 只保留匹配元组',subject:'dbms',gold:['内连接','条件']},
 {topic:'LEFT JOIN 的 ON 与 WHERE 区别',subject:'dbms',gold:['ON','WHERE']},
 {topic:'NULL 与 SQL 三值逻辑 UNKNOWN',subject:'dbms',gold:['NULL','UNKNOWN']},
 {topic:'LEFT JOIN 中 COUNT(*) 和 COUNT(e.cid) 区别',subject:'dbms',gold:['COUNT','NULL']},
 {topic:'条件概率分母 P(B) 与样本空间',subject:'prob',gold:['条件概率','B']},
 {topic:'全概率公式的互斥完备事件',subject:'prob',gold:['全概率','互斥']},
 {topic:'贝叶斯公式的先验与后验',subject:'prob',gold:['贝叶斯','先验']},
];
const forms=['请根据资料解释：','请指出资料中关于以下内容的依据：','请结合课程讲义说明：','复习问题，请引用资料回答：','请简短总结并引用来源：'];
const positives=topics.flatMap(t=>forms.map(f=>({...t,question:f+t.topic,negative:false})));
const negatives=['2027年未公开考试原题','班级明天考试的精确题目','课程助教私人电话号码','下周测验标准答案','我未上传的成绩表','老师未公布的最终评分表','知屿服务器数据库密码','尚未公开的课堂录音内容','我同学未分享的私人笔记','2028年课程招生人数'].map(topic=>({topic,subject:'dbms',gold:[] as string[],question:'只依据课程资料回答：'+topic+'是什么？如果没有资料请明确说资料不足。',negative:true}));
const cases=[...positives,...negatives].map((c,i)=>({...c,id:i+1}));
async function main(){
 if(process.env.LLM_MODE!=='live')throw Error('需要live配置');
 const id=randomUUID(); const user=await q1(`INSERT INTO users(handle,display_name,password_hash) VALUES($1,'C4评测','disabled') RETURNING id`,['rag_'+id.slice(0,8)]);
 const subjects:any={};for(const code of ['dbms','prob'])subjects[code]=(await q1(`SELECT id FROM subjects WHERE code=$1 AND owner_user_id IS NULL`,[code]))!.id;
 const results:any[]=process.env.RAG_EVAL_PHASE==='after' ? JSON.parse(await fs.readFile('docs/test-evidence/rag-eval.json','utf8')).results.filter((r:any)=>r.mode==='before') : []; let next=0;
 const jobs=cases.flatMap(c=>(process.env.RAG_EVAL_PHASE==='after'?['after']:['before','after']).map(mode=>({c,mode})));
 const baselinePrompt=SYSTEM_PROMPT.replace(/每条 citations 必须附 quote[^\n]+/,'').replace(', "quote": "对应片段的原文摘录"','');
 const save=()=>fs.writeFile('docs/test-evidence/rag-eval-final.json',JSON.stringify({runId:id,date:new Date().toISOString(),model:process.env.LLM_MODEL,method:'50条固定问题；40条由8主题×5改写构成，10条无资料问题；原文与主题词核验，不是语义准确率',results},null,2));
 async function worker(){while(next<jobs.length){const {c,mode}=jobs[next++];
  const start=Date.now();let record:any={id:c.id,question:c.question,gold:c.gold,negative:c.negative,mode};
  try{
   const fn=mode==='before'?searchMaterialsBaseline:searchMaterials;
   const r=await fn(user!.id,c.question,{subjectIds:[subjects[c.subject]],limit:4});
   const refs:RefMaterial[]=r.hits.map((h,i)=>({...h,ref:`资料${i+1}`,location:h.pageNo?`第${h.pageNo}页`:`第${h.paragraphNo}段`}));
   record.references=refs;
   record.retrievalHit=c.negative?r.hits.length===0:r.hits.some(h=>c.gold.every(g=>h.content.toLowerCase().includes(g.toLowerCase())));
   const response=await chatCompletion([{role:'system',content:mode==='before'?baselinePrompt:SYSTEM_PROMPT},{role:'user',content:renderContext({learning:{},materials:refs,history:[],intent:'答疑'})},{role:'user',content:c.question}],{json:true,timeoutMs:45000});
   const raw=AgentAnswer.parse(extractJson(response.content));
   record.rawAnswer=raw;
   let answer=raw;
   if(mode==='after'){const checked=await checkAndRepairCitations(raw,refs,async draft=>{const r=await chatCompletion([{role:'system',content:CITATION_REPAIR_PROMPT},{role:'user',content:JSON.stringify({question:c.question,draftAnswer:draft,materials:refs})}],{json:true});return AgentAnswer.parse(extractJson(r.content));});answer=checked.answer;record.repair=checked.repair;record.validation=checked.metrics;}
   else{const valid=new Set(refs.map(r=>r.ref));answer={...raw,citations:raw.citations.filter(c=>valid.has(c.ref.replace(/[\[\]]/g,''))).map(c=>({...c,ref:c.ref.replace(/[\[\]]/g,'')}))};}
   const topical=(text:string)=>c.gold.every(g=>text.toLowerCase().includes(g.toLowerCase()));
   const supported=answer.citations.filter(cit=>{const ref=refs.find(r=>r.ref===cit.ref);return ref&&topical(ref.content);}).length;
   record={...record,status:'complete',retrievalHit:c.negative?r.hits.length===0:r.hits.some(h=>topical(h.content)),citations:answer.citations.length,topicalCitations:supported,hasCitation:answer.citations.length>0,insufficient:answer.basis==='insufficient'||/资料不足|依据不足|没有.*资料/.test(answer.answer),answer:answer.answer,basis:answer.basis,references:refs,rawCitations:raw.citations,checkedCitations:answer.citations,tokens:{prompt:response.promptTokens,completion:response.completionTokens}};
  }catch(e:any){record={...record,status:'failed',error:e.code??'invalid_output'};}
  record.ms=Date.now()-start;results.push(record);console.log(mode,c.id,record.status);await save();
 }}
 try{await fs.mkdir('docs/test-evidence',{recursive:true});await Promise.all([worker(),worker(),worker()]);}finally{await pool.end();}
}
main().catch(()=>{console.error('评测失败，请检查配置');process.exitCode=1;});
