/**
 * 长期记忆（B4 记忆面板）：
 *  - listMemories：当前用户的生效记忆，含知识点名与来源消息定位信息。
 *  - deleteMemory：软删除（status → deleted）。
 *  - correctMemory：修正内容——原记录 status → corrected 保留，新内容作为新 active 记录写入并指向原记录，
 *    修正历史因此完整保留，不物理删除。
 */
import { q, withTx } from "@/db";
import type { CurrentUser } from "./auth";
import { AppError, notFound } from "./errors";

export async function listMemories(user: CurrentUser) {
  return q(
    `SELECT m.id, m.kind, m.content, m.concept_id AS "conceptId", k.name AS "conceptName",
            m.source_message_id AS "sourceMessageId", m.source_conversation_id AS "sourceConversationId",
            m.status, m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            sm.content AS "sourceMessage", sm.role AS "sourceMessageRole", sm.seq AS "sourceMessageSeq",
            sm.created_at AS "sourceMessageCreatedAt", c.title AS "sourceConversationTitle"
     FROM memories m
     LEFT JOIN concepts k ON k.id = m.concept_id
     LEFT JOIN messages sm ON sm.id = m.source_message_id
     LEFT JOIN conversations c ON c.id = m.source_conversation_id
     WHERE m.user_id = $1 AND m.status = 'active'
     ORDER BY m.updated_at DESC, m.created_at DESC`,
    [user.id],
  );
}

export async function deleteMemory(user: CurrentUser, id: string) {
  const r = await q(
    `UPDATE memories SET status = 'deleted', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING id`,
    [id, user.id],
  );
  if (!r.length) throw notFound("记忆");
  return { id };
}

export async function correctMemory(user: CurrentUser, id: string, content: string) {
  const next = content.trim();
  if (!next) throw new AppError("empty", "修正内容不能为空");
  return withTx(async (c) => {
    const m = await c.query(
      `SELECT id, kind, concept_id, source_message_id, source_conversation_id, status
       FROM memories WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, user.id],
    );
    if (!m.rowCount) throw notFound("记忆");
    const orig = m.rows[0];
    if (orig.status !== "active") throw new AppError("not_active", "只能修正当前生效的记忆", 409);
    await c.query(`UPDATE memories SET status = 'corrected', updated_at = now() WHERE id = $1`, [id]);
    const r = await c.query(
      `INSERT INTO memories (user_id, kind, content, concept_id, source_message_id, source_conversation_id, status, corrects_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id, content, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [user.id, orig.kind, next.slice(0, 8000), orig.concept_id, orig.source_message_id, orig.source_conversation_id, orig.id],
    );
    return r.rows[0];
  });
}
