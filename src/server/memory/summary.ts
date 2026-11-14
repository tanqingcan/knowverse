import {q,q1,withTx} from '@/db';
import {memoryReady,lockMemory} from './store';
/** Extractive summaries keep exact source snippets, not generated personal claims. */
export async function refreshSummary(userId:string,conversationId:string,modelCallId:string){
 if(!await memoryReady())return false;
 const state=await q1(`SELECT coalesce(max(m.seq),0)::int AS seq,count(*) FILTER(WHERE m.role='assistant')::int AS rounds,coalesce(sum(length(m.content)),0)::int AS chars,coalesce((SELECT revision FROM memory_controls WHERE user_id=$1),0) AS revision FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id WHERE m.user_id=$1 AND m.conversation_id=$2 AND m.status='complete'`,[userId,conversationId]);
 if(!state||state.rounds<1)return false;
 const old=await q1(`SELECT upto_seq FROM conversation_summaries WHERE conversation_id=$1 AND user_id=$2`,[conversationId,userId]);
 const pending=await q1(`SELECT coalesce(sum(length(content)),0)::int AS chars FROM messages WHERE user_id=$1 AND conversation_id=$2 AND status='complete' AND seq>$3`,[userId,conversationId,old?.upto_seq??0]);
 const long=pending.chars>=6000;
 const upto=state.seq-(long?Math.min(2,state.seq-1):6);
 if(upto<1||upto<=(old?.upto_seq??0)||state.rounds%6!==0&&!long)return false;
 const rows=await q(`SELECT m.seq,m.role,m.content FROM messages m WHERE m.user_id=$1 AND m.conversation_id=$2 AND m.seq<=$3 AND m.status='complete' AND NOT EXISTS(SELECT 1 FROM memories mm WHERE mm.user_id=$1 AND mm.source_message_id IN(m.id,m.reply_to_id)) ORDER BY m.seq DESC LIMIT 16`,[userId,conversationId,upto]);
 const snippets=rows.reverse().map(m=>`[${m.seq} ${m.role}] ${m.content.replace(/\s+/g,' ').slice(0,120)}`);
 while(snippets.join('\n').length>1600)snippets.shift();
 const summary=snippets.join('\n');
 return withTx(async c=>{await lockMemory(c,userId);const revision=(await c.query(`SELECT coalesce((SELECT revision FROM memory_controls WHERE user_id=$1),0) AS revision`,[userId])).rows[0].revision;if(revision!==state.revision)return false;
  await c.query(`INSERT INTO conversation_summaries(conversation_id,user_id,upto_seq,summary,model_call_id,memory_revision) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(conversation_id) DO UPDATE SET upto_seq=excluded.upto_seq,summary=excluded.summary,model_call_id=excluded.model_call_id,memory_revision=excluded.memory_revision,updated_at=now() WHERE conversation_summaries.upto_seq<excluded.upto_seq`,[conversationId,userId,upto,summary,modelCallId,revision]);return true;});
}
export async function memoryRecent(userId:string,conversationId:string,uptoSeq:number){
 const rows=await q(`SELECT m.id,m.seq,m.role,m.content,m.created_at FROM messages m WHERE m.user_id=$1 AND m.conversation_id=$2 AND m.seq>$3 AND m.status='complete' AND NOT EXISTS(SELECT 1 FROM memories mm WHERE mm.user_id=$1 AND mm.status IN('deleted','corrected') AND mm.source_message_id IN(m.id,m.reply_to_id)) ORDER BY m.seq DESC LIMIT 20`,[userId,conversationId,uptoSeq]);
 return rows.reverse().map(m=>({id:m.id,seq:m.seq,role:m.role,content:m.content.slice(0,600),at:new Date(m.created_at).toISOString()}));
}
