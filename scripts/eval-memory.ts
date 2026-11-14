import './env';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {pool,q1} from '../src/db';import {getUserById} from '../src/server/auth';import {sendMessage} from '../src/server/chat';
import {listMemories,deleteMemory,correctMemory} from '../src/server/memories';
async function main(){if(process.env.LLM_MODE!=='live')throw Error('需要live模式');const id=randomUUID();const account=await q1(`INSERT INTO users(handle,display_name,password_hash,timezone) VALUES($1,'C5独立评测','disabled','Asia/Shanghai') RETURNING id`,['mem_'+id.slice(0,8)]);const user=(await getUserById(account!.id))!;const sid=(await q1(`SELECT id FROM subjects WHERE code='dbms' AND owner_user_id IS NULL`))!.id;
 const evidence:any={date:new Date().toISOString(),model:process.env.LLM_MODEL,userId:user.id,turns:[],checks:{}};
 async function ask(text:string){const turn=await sendMessage(user,{text,subjectId:sid});const a=turn.messages.find((m:any)=>m.id===turn.assistantMessageId)!;const call=await q1(`SELECT tool_trace,status FROM model_calls WHERE id=(SELECT model_call_id FROM messages WHERE id=$1)`,[a.id]);evidence.turns.push({text,conversationId:turn.conversation.id,messageId:a.id,status:a.status,answer:a.content,trace:call?.tool_trace});console.log(evidence.turns.length,a.status);return evidence.turns.at(-1);}
 try{
  await ask('请记住：我一直搞不懂 LEFT JOIN，尤其是 ON 和 WHERE 的区别。');
  const first=(await listMemories(user)).find(m=>/搞不懂.*LEFT JOIN/.test(m.content));evidence.checks.sourceSaved=!!first?.sourceMessageId;
  const recalled=await ask('我今天想复习连接查询，你建议从哪里开始？');
  evidence.checks.memoryInjected=!!first&&recalled.trace?.some((t:any)=>t.step==='memory_context'&&t.ids.includes(first.id));
  evidence.checks.crossConversationRecall=evidence.checks.memoryInjected&&/LEFT JOIN|左外连接/i.test(recalled.answer);
  if(first)await deleteMemory(user,first.id);
  const afterDelete=await ask('你目前有哪些关于我的长期学习记忆？只根据当前memory回答，不检索历史工具；没有就明确说没有。');
  evidence.checks.spontaneousPersonalization=/(你的.*难点|你.*(?:之前|搞不懂|困惑)|之前.*你)/.test(recalled.answer);
  evidence.checks.deletedNotInjected=!!first&&!afterDelete.trace?.some((t:any)=>t.step==='memory_context'&&t.ids.includes(first.id));
  await ask('请记住：我喜欢先看SQL例子再听结论。');
  const preference=(await listMemories(user)).find(m=>/先看SQL例子/.test(m.content));
  let corrected:any;if(preference)corrected=await correctMemory(user,preference.id,'我喜欢先听结论，再看最小SQL例子');
  const afterCorrect=await ask('请解释COUNT(*)与COUNT(e.cid)，按你记住的我的解释偏好来讲。');
  evidence.checks.correctedOnly=!!corrected&&afterCorrect.trace?.some((t:any)=>t.step==='memory_context'&&t.ids.includes(corrected.id)&&!t.ids.includes(preference.id));
  evidence.memories=await listMemories(user);
 }finally{await fs.writeFile('docs/test-evidence/memory-live.json',JSON.stringify(evidence,null,2));await pool.end();}
 console.log(JSON.stringify(evidence.checks));
}
main().catch(()=>{console.error('记忆评测失败，已保存可用证据');process.exitCode=1});
