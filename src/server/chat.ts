/**
 * 对话服务：消息持久化 → 智能体（事务外）→ 结果、引用、标签、证据（短事务）
 */
import { q, q1, withTx } from "@/db";
import type { CurrentUser } from "./auth";
import { AppError, notFound } from "./errors";
import { runChatTurn } from "./agent/chat-agent";
import { recordModelCall } from "./agent/trace";
import { llmConfig } from "./agent/llm";
import { addEvidence, type GrowthEvent } from "./growth";
import { createUserConcept } from "./concepts";
import { normName } from "./text";

const STALE_PENDING_MS = () => Number(process.env.LLM_TIMEOUT_MS ?? 45000) + 30_000;

export async function sendMessage(user: CurrentUser, inp: { conversationId?: string | null; text: string; focusConceptId?: string | null; subjectId?: string | null }) {
  const text = inp.text.trim();
  if (!text) throw new AppError("empty", "消息不能为空");
  if (text.length > 4000) throw new AppError("too_long", "消息过长（最多 4000 字）");

  // 事务 1：保存用户消息与“生成中”的助手占位消息
  const ids = await withTx(async (c) => {
    let conversationId = inp.conversationId ?? null;
    let subjectId = inp.subjectId ?? null;
    let focus = inp.focusConceptId ?? null;
    if (focus) {
      const k = await c.query(`SELECT subject_id FROM concepts WHERE id = $1 AND (owner_user_id IS NULL OR owner_user_id = $2)`, [focus, user.id]);
      if (!k.rowCount) throw notFound("知识点");
      subjectId ??= k.rows[0].subject_id;
    }
    if (conversationId) {
      const cv = await c.query(`SELECT id, subject_id, focus_concept_id FROM conversations WHERE id = $1 AND user_id = $2 AND archived_at IS NULL FOR UPDATE`, [conversationId, user.id]);
      if (!cv.rowCount) throw notFound("会话");
      subjectId ??= cv.rows[0].subject_id;
      focus ??= cv.rows[0].focus_concept_id;
    } else {
      const title = text.replace(/\s+/g, " ").slice(0, 28);
      const r = await c.query(`INSERT INTO conversations (user_id, title, subject_id, focus_concept_id) VALUES ($1,$2,$3,$4) RETURNING id`, [user.id, title, subjectId, focus]);
      conversationId = r.rows[0].id;
    }
    const seq = (await c.query(`SELECT coalesce(max(seq), 0) AS s FROM messages WHERE conversation_id = $1`, [conversationId])).rows[0].s;
    const um = await c.query(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status, completed_at) VALUES ($1,$2,$3,'user',$4,'complete',now()) RETURNING id`,
      [conversationId, user.id, seq + 1, text]);
    const am = await c.query(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status, reply_to_id, mode) VALUES ($1,$2,$3,'assistant','','pending',$4,$5) RETURNING id`,
      [conversationId, user.id, seq + 2, um.rows[0].id, llmConfig().mode]);
    if (focus) {
      await c.query(`INSERT INTO message_concepts (message_id, concept_id, source, status, decided_at) VALUES ($1,$2,'context','confirmed',now())`, [um.rows[0].id, focus]);
    }
    await c.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
    await c.query(`UPDATE users SET last_conversation_id = $2 WHERE id = $1`, [user.id, conversationId]);
    return { conversationId: conversationId!, userMessageId: um.rows[0].id as string, assistantMessageId: am.rows[0].id as string, subjectId, focus };
  });

  return generateReply(user, ids.assistantMessageId, { fresh: true });
}

/** 生成（或重试生成）某条助手消息。可安全重复调用：只处理 pending/failed 状态 */
export async function generateReply(user: CurrentUser, assistantMessageId: string, opts: { fresh?: boolean } = {}) {
  const a = await q1(`SELECT a.id, a.conversation_id, a.status, a.reply_to_id, u.content AS question, c.subject_id, c.focus_concept_id
                      FROM messages a JOIN messages u ON u.id = a.reply_to_id JOIN conversations c ON c.id = a.conversation_id
                      WHERE a.id = $1 AND a.user_id = $2 AND a.role = 'assistant'`, [assistantMessageId, user.id]);
  if (!a) throw notFound("消息");
  if (a.status === "complete") return loadTurn(user.id, assistantMessageId, []);
  if (!opts.fresh) {
    // 重试：只有 failed 才能被认领为 pending（并发重试时只有一个请求认领成功，其余直接返回当前状态）
    const claimed = await q(`UPDATE messages SET status = 'pending', error_message = NULL, created_at = now()
                             WHERE id = $1 AND user_id = $2 AND status = 'failed' RETURNING id`, [assistantMessageId, user.id]);
    if (!claimed.length) return loadTurn(user.id, assistantMessageId, []);
  }

  const focusRow = await q1(`SELECT concept_id FROM message_concepts WHERE message_id = $1 AND source = 'context' LIMIT 1`, [a.reply_to_id]);
  let turn;
  try {
    turn = await runChatTurn({ userId: user.id, timezone: user.timezone, conversationId: a.conversation_id, text: a.question, focusConceptId: focusRow?.concept_id ?? a.focus_concept_id, subjectId: a.subject_id });
  } catch (e: any) {
    const code = e?.code ?? "agent_failed";
    const mc = await recordModelCall({ userId: user.id, purpose: "chat", mode: llmConfig().mode, status: code === "llm_timeout" ? "timeout" : code === "llm_invalid_output" ? "invalid_output" : "error", errorCode: code, errorMessage: String(e?.message ?? e) });
    await q(`UPDATE messages SET status = 'failed', error_message = $3, model_call_id = $4 WHERE id = $1 AND user_id = $2`, [assistantMessageId, user.id, String(e?.message ?? "生成失败"), mc]);
    return loadTurn(user.id, assistantMessageId, []);
  }

  const mc = await recordModelCall({ userId: user.id, purpose: "chat", mode: turn.mode, status: "ok", latencyMs: turn.usage.latencyMs, promptTokens: turn.usage.promptTokens, completionTokens: turn.usage.completionTokens, trace: turn.trace });

  // 事务 2：写入回答、引用、标签候选、概念建议；若有已确认的知识点则记为“提问”证据
  const growth = await withTx(async (c) => {
    const upd = await c.query(`UPDATE messages SET content = $3, status = 'complete', basis = $4, mode = $5, model_call_id = $6, completed_at = now(), error_message = NULL
                               WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`,
      [assistantMessageId, user.id, turn.answer.answer, turn.answer.basis, turn.mode, mc]);
    if (!upd.rowCount) return [] as GrowthEvent[];
    let ord = 0;
    for (const cit of turn.answer.citations) {
      const m = turn.materials.find((x) => x.ref === cit.ref);
      if (!m) continue;
      ord += 1;
      await c.query(`INSERT INTO message_citations (message_id, chunk_id, ref_label, quote, ord) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [assistantMessageId, m.chunkId, m.ref, m.content.slice(0, 400), ord]);
    }
    for (const t of turn.tags.matches) {
      await c.query(`INSERT INTO message_concepts (message_id, concept_id, source, status, confidence) VALUES ($1,$2,'ai','candidate',$3) ON CONFLICT DO NOTHING`,
        [a.reply_to_id, t.conceptId, t.confidence]);
    }
    for (const n of turn.tags.newCandidates) {
      await c.query(`INSERT INTO concept_suggestions (user_id, message_id, subject_id, raw_name, name_norm) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [user.id, a.reply_to_id, a.subject_id, n.name, n.norm]);
    }
    await c.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [a.conversation_id]);
    const events: GrowthEvent[] = [];
    if (focusRow?.concept_id) {
      const exists = await c.query(`SELECT 1 FROM learning_evidence WHERE user_id = $1 AND concept_id = $2 AND message_id = $3 AND kind = 'asked'`, [user.id, focusRow.concept_id, a.reply_to_id]);
      if (!exists.rowCount) {
        const r = await addEvidence(c, { userId: user.id, conceptId: focusRow.concept_id, kind: "asked", messageId: a.reply_to_id, detail: `围绕该知识点提问：“${a.question.slice(0, 40)}”`, aiAssisted: false });
        events.push(...r.events);
      }
    }
    return events;
  });
  return loadTurn(user.id, assistantMessageId, growth);
}

async function loadTurn(userId: string, assistantMessageId: string, growth: GrowthEvent[]) {
  const m = await q1(`SELECT conversation_id FROM messages WHERE id = $1 AND user_id = $2`, [assistantMessageId, userId]);
  const conv = await conversationWindow(userId, m!.conversation_id, { aroundMessageId: assistantMessageId });
  return { ...conv, assistantMessageId, growth };
}

/** 打开会话：可定位到某条消息并带上前后文；把超时未完成的 pending 标为中断 */
export async function conversationWindow(userId: string, conversationId: string, opts: { aroundMessageId?: string; beforeSeq?: number; limit?: number } = {}) {
  const conv = await q1(`SELECT c.id, c.title, c.origin, c.subject_id AS "subjectId", s.name AS "subjectName", c.focus_concept_id AS "focusConceptId", k.name AS "focusConceptName",
                                c.created_at AS "createdAt", c.updated_at AS "updatedAt"
                         FROM conversations c LEFT JOIN subjects s ON s.id = c.subject_id LEFT JOIN concepts k ON k.id = c.focus_concept_id
                         WHERE c.id = $1 AND c.user_id = $2`, [conversationId, userId]);
  if (!conv) throw notFound("会话");
  await q(`UPDATE messages SET status = 'failed', error_message = '生成被中断（服务重启或连接断开），可以安全重试'
           WHERE conversation_id = $1 AND user_id = $2 AND status = 'pending' AND created_at < now() - make_interval(secs => $3)`,
    [conversationId, userId, STALE_PENDING_MS() / 1000]);
  const limit = opts.limit ?? 60;
  let fromSeq = 0;
  if (opts.aroundMessageId) {
    const t = await q1(`SELECT seq FROM messages WHERE id = $1 AND conversation_id = $2 AND user_id = $3`, [opts.aroundMessageId, conversationId, userId]);
    if (!t) throw notFound("消息");
    const total = (await q1(`SELECT max(seq) AS m FROM messages WHERE conversation_id = $1`, [conversationId]))!.m;
    fromSeq = Math.max(0, Math.min(t.seq - 10, total - limit + 1) - 1);
  } else if (opts.beforeSeq) {
    fromSeq = Math.max(0, opts.beforeSeq - limit - 1);
  } else {
    const total = (await q1(`SELECT coalesce(max(seq), 0) AS m FROM messages WHERE conversation_id = $1`, [conversationId]))!.m;
    fromSeq = Math.max(0, total - limit);
  }
  const msgs = await q(`SELECT m.id, m.seq, m.role, m.content, m.status, m.mode, m.basis, m.reply_to_id AS "replyToId", m.error_message AS "errorMessage",
                               m.created_at AS "createdAt", mc.model, mc.provider, mc.latency_ms AS "latencyMs"
                        FROM messages m LEFT JOIN model_calls mc ON mc.id = m.model_call_id
                        WHERE m.conversation_id = $1 AND m.user_id = $2 AND m.seq > $3 AND ($4::int IS NULL OR m.seq < $4)
                        ORDER BY m.seq LIMIT $5`, [conversationId, userId, fromSeq, opts.beforeSeq ?? null, limit]);
  const ids = msgs.map((m) => m.id);
  const cites = ids.length ? await q(`SELECT mc.message_id AS "messageId", mc.ref_label AS ref, mc.quote, mc.ord, ch.id AS "chunkId", ch.page_no AS "pageNo", ch.paragraph_no AS "paragraphNo",
                                             v.id AS "versionId", v.version_no AS "versionNo", v.file_type AS "fileType", mat.id AS "materialId", mat.title AS "materialTitle"
                                      FROM message_citations mc JOIN material_chunks ch ON ch.id = mc.chunk_id
                                      JOIN material_versions v ON v.id = ch.version_id JOIN materials mat ON mat.id = v.material_id
                                      WHERE mc.message_id = ANY($1::uuid[]) ORDER BY mc.ord`, [ids]) : [];
  const tags = ids.length ? await q(`SELECT mc.message_id AS "messageId", k.id AS "conceptId", k.name, mc.status, mc.source
                                     FROM message_concepts mc JOIN concepts k ON k.id = mc.concept_id
                                     WHERE mc.message_id = ANY($1::uuid[]) ORDER BY mc.created_at`, [ids]) : [];
  const sugg = ids.length ? await q(`SELECT id, message_id AS "messageId", raw_name AS name, status FROM concept_suggestions
                                     WHERE message_id = ANY($1::uuid[]) AND user_id = $2 AND status = 'pending'`, [ids, userId]) : [];
  const minSeq = msgs[0]?.seq ?? 1;
  return {
    conversation: conv,
    hasEarlier: minSeq > 1,
    messages: msgs.map((m) => ({
      ...m,
      citations: cites.filter((c) => c.messageId === m.id),
      tags: tags.filter((t) => t.messageId === m.id),
      suggestions: sugg.filter((s) => s.messageId === m.id),
    })),
  };
}

/** 用户确认 / 拒绝 / 新增标签。确认用户问题上的标签时，记为该知识点的“提问”证据 */
export async function setTag(user: CurrentUser, messageId: string, conceptId: string, status: "confirmed" | "rejected") {
  return withTx(async (c) => {
    const m = await c.query(`SELECT id, role, content FROM messages WHERE id = $1 AND user_id = $2`, [messageId, user.id]);
    if (!m.rowCount) throw notFound("消息");
    const k = await c.query(`SELECT id FROM concepts WHERE id = $1 AND (owner_user_id IS NULL OR owner_user_id = $2)`, [conceptId, user.id]);
    if (!k.rowCount) throw notFound("知识点");
    await c.query(`INSERT INTO message_concepts (message_id, concept_id, source, status, decided_at) VALUES ($1,$2,'user',$3,now())
                   ON CONFLICT (message_id, concept_id) DO UPDATE SET status = EXCLUDED.status, decided_at = now()`, [messageId, conceptId, status]);
    const events: GrowthEvent[] = [];
    if (status === "confirmed" && m.rows[0].role === "user") {
      const ex = await c.query(`SELECT 1 FROM learning_evidence WHERE user_id = $1 AND concept_id = $2 AND message_id = $3 AND kind = 'asked' AND revoked_at IS NULL`, [user.id, conceptId, messageId]);
      if (!ex.rowCount) {
        const r = await addEvidence(c, { userId: user.id, conceptId, kind: "asked", messageId, detail: `确认提问标签：“${m.rows[0].content.slice(0, 40)}”` });
        events.push(...r.events);
      }
    }
    if (status === "rejected") {
      // 拒绝标签：若之前因此产生过提问证据，撤销并说明原因（保留历史）
      const ev = await c.query(`SELECT id FROM learning_evidence WHERE user_id = $1 AND concept_id = $2 AND message_id = $3 AND kind = 'asked' AND revoked_at IS NULL`, [user.id, conceptId, messageId]);
      const { revokeEvidence } = await import("./growth");
      for (const e of ev.rows) { const r = await revokeEvidence(c, user.id, e.id, "用户修正：这条提问与该知识点无关"); if (r) events.push(...r.events); }
    }
    return { growth: events };
  });
}

/** 接受 AI 提出的新概念：在本人范围内建立知识点（同名则复用），并为问题打上确认标签 */
export async function acceptSuggestion(user: CurrentUser, suggestionId: string, opts: { subjectId?: string; name?: string }) {
  const s = await q1(`SELECT id, message_id, subject_id, raw_name FROM concept_suggestions WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [suggestionId, user.id]);
  if (!s) throw notFound("概念候选");
  const subjectId = opts.subjectId ?? s.subject_id;
  if (!subjectId) throw new AppError("need_subject", "请选择这个知识点属于哪个学科");
  const { id: conceptId } = await createUserConcept(undefined, user.id, subjectId, opts.name ?? s.raw_name);
  await q(`UPDATE concept_suggestions SET status = 'accepted', accepted_concept_id = $3 WHERE id = $1 AND user_id = $2`, [suggestionId, user.id, conceptId]);
  const r = await setTag(user, s.message_id, conceptId, "confirmed");
  return { conceptId, ...r };
}

export async function dismissSuggestion(user: CurrentUser, suggestionId: string) {
  await q(`UPDATE concept_suggestions SET status = 'dismissed' WHERE id = $1 AND user_id = $2`, [suggestionId, user.id]);
  return { ok: true };
}

export async function renameConversation(user: CurrentUser, id: string, title: string) {
  const r = await q(`UPDATE conversations SET title = $3 WHERE id = $1 AND user_id = $2 RETURNING id`, [id, user.id, title.trim().slice(0, 60) || "未命名对话"]);
  if (!r.length) throw notFound("会话");
  return { ok: true };
}

/** 归档会话：保留消息、引用与证据（证据可能仍引用这些消息），只是不再出现在列表与检索中 */
export async function archiveConversation(user: CurrentUser, id: string) {
  const r = await q(`UPDATE conversations SET archived_at = now() WHERE id = $1 AND user_id = $2 AND archived_at IS NULL RETURNING id`, [id, user.id]);
  if (!r.length) throw notFound("会话");
  return { ok: true };
}

export { normName };
