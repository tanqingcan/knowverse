/**
 * 长期记忆（B4 记忆面板）：
 *  - listMemories：当前用户的生效记忆，含知识点名与来源消息定位信息。
 *  - deleteMemory：软删除（status → deleted）。
 *  - correctMemory：修正内容——原记录 status → corrected 保留，新内容作为新 active 记录写入并指向原记录，
 *    修正历史因此完整保留，不物理删除。
 */
import { q, withTx } from "@/db";
import {memoryReady,lockMemory,invalidateMemoryContext} from "./memory/store";
import {memoryKey} from "./memory/policy";
import type { CurrentUser } from "./auth";
import { AppError, notFound } from "./errors";

export async function listMemories(user: CurrentUser) {
  const extended=await memoryReady();
  return q(
    `SELECT m.id, m.kind, m.content, m.concept_id AS "conceptId", k.name AS "conceptName",
            m.source_message_id AS "sourceMessageId", m.source_conversation_id AS "sourceConversationId",
            m.status, m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            sm.content AS "sourceMessage", sm.role AS "sourceMessageRole", sm.seq AS "sourceMessageSeq",
            sm.created_at AS "sourceMessageCreatedAt", c.title AS "sourceConversationTitle"
     FROM memories m
     LEFT JOIN concepts k ON k.id = m.concept_id
     LEFT JOIN messages sm ON sm.id = m.source_message_id AND sm.user_id=m.user_id
     LEFT JOIN conversations c ON c.id = m.source_conversation_id AND c.user_id=m.user_id
     WHERE m.user_id = $1 AND m.status = 'active' ${extended ? "AND (m.expires_at IS NULL OR m.expires_at>now())" : ""}
     ORDER BY m.updated_at DESC, m.created_at DESC`,
    [user.id],
  );
}

export async function deleteMemory(user: CurrentUser, id: string) {
  const extended=await memoryReady();
  return withTx(async c=>{
    if(extended)await lockMemory(c,user.id);
    const r=await c.query(`UPDATE memories SET status='deleted',updated_at=now() ${extended?", revoked_at=now(),revoke_reason='user_deleted'":""} WHERE id=$1 AND user_id=$2 AND status='active' RETURNING id`,[id,user.id]);
    if(!r.rowCount)throw notFound("记忆");
    if(extended)await invalidateMemoryContext(c,user.id);
    return {id};
  });
}

export async function correctMemory(user: CurrentUser, id: string, content: string) {
  const next = content.trim();
  if (!next) throw new AppError("empty", "修正内容不能为空");
  const extended=await memoryReady();
  return withTx(async (c) => {
    if(extended)await lockMemory(c,user.id);
    const m = await c.query(
      `SELECT id, kind, concept_id, source_message_id, source_conversation_id, status ${extended?",expires_at":""}
       FROM memories WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, user.id],
    );
    if (!m.rowCount) throw notFound("记忆");
    const orig = m.rows[0];
    if (orig.status !== "active") throw new AppError("not_active", "只能修正当前生效的记忆", 409);
    await c.query(`UPDATE memories SET status='corrected',updated_at=now() ${extended?",revoked_at=now(),revoke_reason='user_corrected'":""} WHERE id=$1`,[id]);
    if(extended){
      await invalidateMemoryContext(c,user.id);
      const norm=memoryKey(next.slice(0,8000));
      const existing=await c.query(`SELECT id,content,status FROM memories WHERE user_id=$1 AND kind=$2 AND content_norm=$3 AND status='active'`,[user.id,orig.kind,norm]);
      if(existing.rowCount)return existing.rows[0];
    }
    const r = await c.query(
      `INSERT INTO memories (user_id, kind, content, concept_id, source_message_id, source_conversation_id, status, corrects_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id, content, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [user.id, orig.kind, next.slice(0, 8000), orig.concept_id, orig.source_message_id, orig.source_conversation_id, orig.id],
    );
    if(extended)await c.query(`UPDATE memories SET content_norm=$2,confidence=1,importance=5,expires_at=$3 WHERE id=$1`,[r.rows[0].id,memoryKey(next.slice(0,8000)),orig.expires_at]);
    return r.rows[0];
  });
}
