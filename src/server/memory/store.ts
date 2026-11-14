import {normName} from '../text';
import {q,q1,type Tx} from '@/db';
import {MemoryProposal,memoryKey,validProposal,ttlDays} from './policy';
export async function memoryReady(){return !!(await q1(`SELECT to_regclass('public.conversation_summaries') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='memories' AND column_name='content_norm') AS ready`))?.ready;}
export async function lockMemory(c:Tx,userId:string){await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,5))`,[userId]);}
export async function invalidateMemoryContext(c:Tx,userId:string){await c.query(`INSERT INTO memory_controls(user_id,revision) VALUES($1,1) ON CONFLICT(user_id) DO UPDATE SET revision=memory_controls.revision+1`,[userId]);await c.query(`DELETE FROM conversation_summaries WHERE user_id=$1`,[userId]);}
export async function saveProposals(c:Tx,userId:string,sourceId:string,raw:unknown[]){
 await lockMemory(c,userId);
 const source=(await c.query(`SELECT id,content,conversation_id FROM messages WHERE id=$1 AND user_id=$2 AND role='user' AND status='complete'`,[sourceId,userId])).rows[0];
 if(!source)return {saved:0,rejected:raw.length};let saved=0,rejected=0;
 for(const value of raw.slice(0,3)){
  const parsed=MemoryProposal.safeParse(value);if(!parsed.success||!validProposal(source.content,parsed.data)){rejected++;continue;}
  const p=parsed.data,norm=memoryKey(p.content);
  // 删除/修正形成墓碑；自动提议不能重新写回同一原文或旧来源。
  const blocked=await c.query(`SELECT 1 FROM memories WHERE user_id=$1 AND status IN ('deleted','corrected') AND revoke_reason IS DISTINCT FROM 'expired' AND (content_norm=$2 OR source_message_id=$3)`,[userId,norm,sourceId]);
  if(blocked.rowCount){rejected++;continue;}
  let conceptId=p.conceptId??null;
  const related=await c.query(`SELECT k.id FROM concepts k WHERE (k.owner_user_id IS NULL OR k.owner_user_id=$1) AND k.archived_at IS NULL AND ($3::uuid IS NULL OR k.id=$3) AND (position(k.name_norm in $2)>0 OR EXISTS(SELECT 1 FROM concept_aliases ca WHERE ca.concept_id=k.id AND position(ca.alias_norm in $2)>0)) ORDER BY length(k.name_norm) DESC,k.id LIMIT 1`,[userId,normName(p.content),conceptId]);
  if(conceptId&&!related.rowCount){rejected++;continue;}
  conceptId=related.rows[0]?.id??null;
  await c.query(`UPDATE memories SET status='deleted',revoked_at=now(),revoke_reason='expired',updated_at=now() WHERE user_id=$1 AND status='active' AND content_norm=$2 AND expires_at<=now()`,[userId,norm]);
  await c.query(`INSERT INTO memories(user_id,kind,content,content_norm,concept_id,source_message_id,source_conversation_id,confidence,importance,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+make_interval(days=>$10)) ON CONFLICT(user_id,kind,content_norm) WHERE status='active' AND content_norm IS NOT NULL DO UPDATE SET updated_at=now(),expires_at=excluded.expires_at,confidence=greatest(memories.confidence,excluded.confidence),importance=greatest(memories.importance,excluded.importance)`,[userId,p.kind,p.content,norm,conceptId,sourceId,source.conversation_id,p.confidence,p.importance,ttlDays[p.kind]]);saved++;
 }
 return {saved,rejected};
}
export async function readMemoryContext(userId:string,conversationId:string,conceptId?:string|null){
 if(!await memoryReady())return {enabled:false,memories:[],summary:null};
 const rows=await q(`SELECT m.id,m.kind,m.content,m.concept_id AS "conceptId",m.source_message_id AS "sourceMessageId",m.source_conversation_id AS "sourceConversationId" FROM memories m JOIN messages sm ON sm.id=m.source_message_id AND sm.user_id=m.user_id AND sm.role='user' WHERE m.user_id=$1 AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now()) ORDER BY (m.concept_id=$2::uuid) DESC NULLS LAST,m.importance DESC,m.updated_at DESC,m.id LIMIT 20`,[userId,conceptId??null]);
 const memories:typeof rows=[];for(const row of rows){if(memories.length>=5)break;if(Buffer.byteLength(JSON.stringify([...memories,row]),'utf8')<=1800)memories.push(row);}
 const summary=await q1(`SELECT s.summary,s.upto_seq AS "uptoSeq" FROM conversation_summaries s JOIN conversations cv ON cv.id=s.conversation_id AND cv.user_id=s.user_id LEFT JOIN memory_controls ctrl ON ctrl.user_id=s.user_id WHERE s.user_id=$1 AND s.conversation_id=$2 AND s.memory_revision=coalesce(ctrl.revision,0) AND cv.archived_at IS NULL`,[userId,conversationId]);
 return {enabled:true,memories,summary};
}
