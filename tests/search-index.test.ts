import {beforeAll,describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import {makeUser,q,q1,concept} from './helpers';
import {searchHistory,buildHistorySql} from '@/server/history';
import {searchTerms} from '@/server/search/terms';
let user:any,other:any;
beforeAll(async()=>{await q(await fs.readFile('docs/sql/drafts/message-terms.sql','utf8'));user=await makeUser('idx');other=await makeUser('idxother');});
async function message(text:string,title='检索测试'){
 const c=await q1(`INSERT INTO conversations(user_id,title) VALUES($1,$2) RETURNING id`,[user.id,title]);
 const m=await q1(`INSERT INTO messages(user_id,conversation_id,seq,role,content) VALUES($1,$2,1,'user',$3) RETURNING id`,[user.id,c.id,text]);return {cid:c.id,id:m.id};
}
describe('中文倒排索引',()=>{
 it('SQL和TS分词一致，重复词有权重',async()=>{
  const text='索引索引 LEFT JOIN ABC_12 条件概率';const rows=await q(`SELECT * FROM kv_search_terms($1)`,[text]);
  expect(rows.map(r=>r.term).sort()).toEqual(searchTerms(text).sort());expect(rows.find(r=>r.term==='索引').weight).toBe(2);
 });
 it('两个字命中；较长中文必须连续，不能只凭二元组散落命中',async()=>{
  const a=await message('条件概率是一个重要概念');await message('条件在前；件概在后；概率在尾');
  const r=await searchHistory(user.id,'Asia/Shanghai',{keyword:'条件概率',page:1,pageSize:50});
  expect(r.hits.map(h=>h.questionId)).toEqual([a.id]);
  expect((await searchHistory(user.id,'Asia/Shanghai',{keyword:'概率',page:1,pageSize:50})).total).toBe(2);
 });
 it('编辑内容、改标题会同步索引；删除级联清理',async()=>{
  const a=await message('旧词数据','旧标题');await q(`UPDATE messages SET content='新词数据' WHERE id=$1`,[a.id]);
  expect((await q(`SELECT 1 FROM message_terms WHERE message_id=$1 AND term='旧词'`,[a.id]))).toHaveLength(0);
  await q(`UPDATE conversations SET title='特殊标题' WHERE id=$1`,[a.cid]);
  expect((await searchHistory(user.id,'Asia/Shanghai',{keyword:'特殊',page:1,pageSize:10})).hits[0].questionId).toBe(a.id);
  await q(`DELETE FROM messages WHERE id=$1`,[a.id]);expect(await q(`SELECT 1 FROM message_terms WHERE message_id=$1`,[a.id])).toHaveLength(0);
 });
 it('知识点别名召回并隔离他人记录，拒绝标签不参与',async()=>{
  const a=await message('保留左表未匹配行的提问');const cid=await concept('左外连接');
  await q(`INSERT INTO message_concepts(message_id,concept_id,source,status) VALUES($1,$2,'user','confirmed')`,[a.id,cid]);
  const r=await searchHistory(user.id,'Asia/Shanghai',{keyword:'LEFT OUTER JOIN',page:1,pageSize:50});expect(r.hits.some(h=>h.questionId===a.id)).toBe(true);
  expect((await searchHistory(other.id,'Asia/Shanghai',{keyword:'LEFT OUTER JOIN',page:1,pageSize:50})).total).toBe(0);
  await q(`UPDATE message_concepts SET status='rejected' WHERE message_id=$1`,[a.id]);expect((await searchHistory(user.id,'Asia/Shanghai',{keyword:'LEFT OUTER JOIN',page:1,pageSize:50})).hits.some(h=>h.questionId===a.id)).toBe(false);
 });
 it('数字混合中文、英文子串和通配符字面量仍可检索',async()=>{
  const a=await message('索引10 SELECT 10% a_b');
  for(const keyword of ['索引10','SEL','10%','a_b']){
   const r=await searchHistory(user.id,'Asia/Shanghai',{keyword,page:1,pageSize:50});
   expect(r.hits.some(h=>h.questionId===a.id)).toBe(true);
  }
  const b=await message('完全无关');
  expect((await searchHistory(user.id,'Asia/Shanghai',{keyword:'%',page:1,pageSize:50})).hits.some(h=>h.questionId===b.id)).toBe(false);
 });
 it('草案可重复执行并回填已有消息，旧查询回退可用',async()=>{
  await q(await fs.readFile('docs/sql/drafts/message-terms.sql','utf8'));
  const a=await message('回填验证');
  const stmt=buildHistorySql({keyword:'回填',page:1,pageSize:10},user.id,'Asia/Shanghai',false);expect((await q(stmt.text,stmt.params)).some(r=>r.question_id===a.id)).toBe(true);
 });
});
