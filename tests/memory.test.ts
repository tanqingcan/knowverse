import {beforeAll,describe,it,expect} from 'vitest';import fs from 'node:fs/promises';
import {makeUser,q,q1,concept} from './helpers';import {withTx} from '@/db';
import {saveProposals,readMemoryContext} from '@/server/memory/store';
import {refreshSummary,memoryRecent} from '@/server/memory/summary';
import {deleteMemory,correctMemory,listMemories} from '@/server/memories';
import {runTool} from '@/server/agent/tools';
let u:any,v:any;
beforeAll(async()=>{await q(await fs.readFile('docs/sql/drafts/memory-system.sql','utf8'));u=await makeUser('mem');v=await makeUser('memv');});
async function source(text:string){const cv=await q1(`INSERT INTO conversations(user_id,title) VALUES($1,'记忆测试') RETURNING id`,[u.id]);const m=await q1(`INSERT INTO messages(user_id,conversation_id,seq,role,content) VALUES($1,$2,1,'user',$3) RETURNING id`,[u.id,cv.id,text]);return {id:m.id,conversationId:cv.id};}
const proposal=(content:string)=>({kind:'fact',content,confidence:.9,importance:4});
describe('C5记忆',()=>{
 it('模型工具仅提议不写库；来源必须属于当前用户，内容不得改写',async()=>{
  const s=await source('我一直搞不懂LEFT JOIN');const ctx={userId:u.id,timezone:'Asia/Shanghai',trace:[],memoryProposals:[]};
  await runTool('propose_memory',proposal('我一直搞不懂LEFT JOIN'),ctx);expect(ctx.memoryProposals).toHaveLength(1);
  expect((await listMemories(u))).toHaveLength(0);
  expect((await withTx(c=>saveProposals(c,v.id,s.id,ctx.memoryProposals))).saved).toBe(0);
  expect((await withTx(c=>saveProposals(c,u.id,s.id,[proposal('我已经学会LEFT JOIN')]))).saved).toBe(0);
 });
 it('写入带来源，跨会话读取，自动关联知识点，并发重复只留一条',async()=>{
  const s=await source('我一直搞不懂 LEFT JOIN');const p=proposal('我一直搞不懂 LEFT JOIN');
  await Promise.all([withTx(c=>saveProposals(c,u.id,s.id,[p])),withTx(c=>saveProposals(c,u.id,s.id,[p]))]);
  const list=await listMemories(u);expect(list).toHaveLength(1);expect(list[0].sourceMessageId).toBe(s.id);expect(list[0].conceptId).toBe(await concept('左外连接'));
  const fresh=await source('新会话');const context=await readMemoryContext(u.id,fresh.conversationId);expect(context.memories.some(m=>m.content===p.content)).toBe(true);
  expect((await readMemoryContext(v.id,fresh.conversationId)).memories).toHaveLength(0);
 });
 it('删除后不注入，旧来源再提议被墓碑拒绝',async()=>{
  const m=(await listMemories(u))[0];await deleteMemory(u,m.id);
  const context=await readMemoryContext(u.id,m.sourceConversationId);expect(context.memories.some(x=>x.id===m.id)).toBe(false);
  expect((await memoryRecent(u.id,m.sourceConversationId,0)).some(x=>x.id===m.sourceMessageId)).toBe(false);
  expect((await withTx(c=>saveProposals(c,u.id,m.sourceMessageId,[proposal(m.content)]))).saved).toBe(0);
  await expect(deleteMemory(v,m.id)).rejects.toMatchObject({code:'not_found'});
 });
 it('过期记忆不返回；再次明确自述可更新已过期内容',async()=>{
  const s=await source('我正在准备概率考试');await withTx(c=>saveProposals(c,u.id,s.id,[{...proposal('我正在准备概率考试'),kind:'event'}]));
  await q(`UPDATE memories SET expires_at=now()-interval '1 day' WHERE source_message_id=$1`,[s.id]);
  expect((await listMemories(u)).some(m=>m.sourceMessageId===s.id)).toBe(false);
  const next=await source('我正在准备概率考试');await withTx(c=>saveProposals(c,u.id,next.id,[{...proposal('我正在准备概率考试'),kind:'event'}]));
  expect((await listMemories(u)).filter(m=>m.content==='我正在准备概率考试')).toHaveLength(1);
 });
 it('修正保留原记录与来源，清除摘要，不允许旧事实重新注入',async()=>{
  const s=await source('我喜欢先看SQL例子');await withTx(c=>saveProposals(c,u.id,s.id,[{...proposal('我喜欢先看SQL例子'),kind:'preference'}]));const m=(await listMemories(u)).find(m=>m.sourceMessageId===s.id)!;
  await q(`INSERT INTO conversation_summaries(conversation_id,user_id,upto_seq,summary) VALUES($1,$2,1,'旧偏好')`,[s.conversationId,u.id]);
  await expect(correctMemory(v,m.id,'别人的改动')).rejects.toMatchObject({code:'not_found'});
  const next=await correctMemory(u,m.id,'我喜欢先听结论，再看SQL例子');expect((await q1(`SELECT status FROM memories WHERE id=$1`,[m.id])).status).toBe('corrected');
  const context=await readMemoryContext(u.id,s.conversationId);expect(context.summary).toBeNull();expect(context.memories.some(m=>m.id===next.id&&m.content.includes('先听结论'))).toBe(true);
  expect((await withTx(c=>saveProposals(c,u.id,s.id,[{...proposal(m.content),kind:'preference'}]))).saved).toBe(0);
 });
 it('6轮生成摘录摘要，来源可追溯，不能读取他人摘要',async()=>{
  const s=await source('解释COUNT函数');for(let i=1;i<=6;i++){const qm=i===1?s.id:(await q1(`INSERT INTO messages(user_id,conversation_id,seq,role,content) VALUES($1,$2,$3,'user','解释聚合函数') RETURNING id`,[u.id,s.conversationId,i*2-1])).id;await q(`INSERT INTO messages(user_id,conversation_id,seq,role,content,reply_to_id) VALUES($1,$2,$3,'assistant','COUNT计算行数',$4)`,[u.id,s.conversationId,i*2,qm]);}
  const mc=await q1(`INSERT INTO model_calls(user_id,purpose,mode,status) VALUES($1,'chat','demo','ok') RETURNING id`,[u.id]);expect(await refreshSummary(u.id,s.conversationId,mc.id)).toBe(true);
  const context=await readMemoryContext(u.id,s.conversationId);expect(context.summary?.uptoSeq).toBe(6);expect(context.summary?.summary).toContain('[1 user]');
  expect((await readMemoryContext(v.id,s.conversationId)).summary).toBeNull();
 });
 it('未满6轮的超长上下文也会生成摘要',async()=>{
  const s=await source('解释'.repeat(1500));
  await q(`INSERT INTO messages(user_id,conversation_id,seq,role,content,reply_to_id) VALUES($1,$2,2,'assistant',$3,$4)`,[u.id,s.conversationId,'内容'.repeat(2200),s.id]);
  const mc=await q1(`INSERT INTO model_calls(user_id,purpose,mode,status) VALUES($1,'chat','demo','ok') RETURNING id`,[u.id]);
  expect(await refreshSummary(u.id,s.conversationId,mc.id)).toBe(true);
  expect((await readMemoryContext(u.id,s.conversationId)).summary?.uptoSeq).toBe(1);
 });
 it('低置信度与凭证不保存，上下文受TopK和字节预算限制',async()=>{
  const s=await source('我喜欢SQL例子，请记住我的密码是example');expect((await withTx(c=>saveProposals(c,u.id,s.id,[proposal('请记住我的密码是example'),{...proposal('我喜欢SQL例子'),confidence:.4}]))).saved).toBe(0);
  const r=await readMemoryContext(u.id,s.conversationId);expect(r.memories.length).toBeLessThanOrEqual(5);expect(Buffer.byteLength(JSON.stringify(r.memories),'utf8')).toBeLessThanOrEqual(1800);
 });
});
