import type {HistoryQuery} from "../history";
import {escapeLike} from "../text";
export function buildHistorySqlBaseline(input: HistoryQuery, userId: string, tz: string) {
  const params: unknown[] = [userId, tz];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = ["qm.user_id = $1", "qm.role = 'user'", "c.archived_at IS NULL"];
  let candidate = "";
  if (input.keyword) {
    const kw = p(`%${escapeLike(input.keyword)}%`);
    // 三路候选分别命中各自的 trgm 索引，再 UNION 成问题 id 集合
    candidate = `cand AS (
        SELECT m.id AS qid FROM messages m
         WHERE m.user_id = $1 AND m.role = 'user' AND m.content ILIKE ${kw} ESCAPE '\\'
      UNION
        SELECT m.reply_to_id FROM messages m
         WHERE m.user_id = $1 AND m.role = 'assistant' AND m.content ILIKE ${kw} ESCAPE '\\'
      UNION
        SELECT m.id FROM conversations cv JOIN messages m ON m.conversation_id = cv.id AND m.user_id = cv.user_id
         WHERE cv.user_id = $1 AND m.role = 'user' AND cv.title ILIKE ${kw} ESCAPE '\\'
    ),`;

  }
  if (input.from) where.push(`qm.created_at >= (${p(input.from)}::date)::timestamp AT TIME ZONE $2`);
  if (input.to) where.push(`qm.created_at < ((${p(input.to)}::date + 1)::timestamp AT TIME ZONE $2)`);
  if (input.conceptIds?.length) {
    where.push(`EXISTS (SELECT 1 FROM message_concepts mc
                         WHERE mc.message_id IN (qm.id, am.id) AND mc.status <> 'rejected'
                           AND mc.concept_id = ANY(${p(input.conceptIds)}::uuid[]))`);
  }
  if (input.subjectId) {
    const s = p(input.subjectId);
    where.push(`(c.subject_id = ${s} OR EXISTS (SELECT 1 FROM message_concepts mc JOIN concepts k ON k.id = mc.concept_id
                  WHERE mc.message_id IN (qm.id, am.id) AND mc.status <> 'rejected' AND k.subject_id = ${s}))`);
  }
  const limit = p(input.pageSize);
  const offset = p((input.page - 1) * input.pageSize);
  const text = `WITH ${candidate} base AS (
  SELECT qm.id AS question_id, qm.conversation_id, qm.content AS question, qm.created_at,
         c.title, c.origin, am.id AS answer_id, am.content AS answer, am.status AS answer_status
  FROM ${input.keyword ? "cand JOIN messages qm ON qm.id = cand.qid" : "messages qm"}
  JOIN conversations c ON c.id = qm.conversation_id AND c.user_id = qm.user_id
  LEFT JOIN LATERAL (
     SELECT a.id, a.content, a.status FROM messages a
     WHERE a.reply_to_id = qm.id AND a.user_id = qm.user_id
     ORDER BY a.seq DESC LIMIT 1) am ON true
  WHERE ${where.join("\n    AND ")}
)
SELECT b.*, to_char(b.created_at AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS local_time, count(*) OVER () AS total
FROM base b
ORDER BY b.created_at DESC, b.question_id DESC
LIMIT ${limit} OFFSET ${offset}`;
  return { text, params };
}

