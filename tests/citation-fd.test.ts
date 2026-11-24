import {describe,it,expect} from 'vitest';
import {q,q1,makeUser} from './helpers';
describe('引用摘录的业务函数依赖',()=>{
 it('同一不可变chunk可在不同回答中保存不同连续摘录',async()=>{
  const u=await makeUser('fdquote');
  const ch=await q1(`SELECT id,content FROM material_chunks WHERE length(content)>16 LIMIT 1`);
  const c=await q1(`INSERT INTO conversations(user_id,title) VALUES($1,'FD反例') RETURNING id`,[u.id]);
  const parent=await q1(`INSERT INTO messages(conversation_id,user_id,seq,role,content) VALUES($1,$2,1,'user','引用问题') RETURNING id`,[c.id,u.id]);
  const quotes=[ch.content.slice(0,8),ch.content.slice(8,16)];
  // 选择不同原文区间，若文本重复则附加第二片段范围以保证事实不同。
  if(quotes[0]===quotes[1])quotes[1]=ch.content.slice(0,12);
  for(let i=0;i<2;i++){
   const m=await q1(`INSERT INTO messages(conversation_id,user_id,seq,role,content,reply_to_id) VALUES($1,$2,$3,'assistant','引用原文',$4) RETURNING id`,[c.id,u.id,i+2,parent.id]);
   await q(`INSERT INTO message_citations(message_id,chunk_id,ref_label,quote,ord) VALUES($1,$2,'资料1',$3,1)`,[m.id,ch.id,quotes[i]]);
  }
  const r=await q1(`SELECT count(DISTINCT quote)::int n FROM message_citations mc JOIN messages m ON m.id=mc.message_id WHERE mc.chunk_id=$1 AND m.conversation_id=$2`,[ch.id,c.id]);
  expect(r.n).toBe(2);
 });
});
