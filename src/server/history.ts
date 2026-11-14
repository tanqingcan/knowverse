/**
 * 历史问答检索（课程必选主线）
 *
 *  检索单位：一组“问答”= 一条用户消息 + 它的助手回复。
 *  条件：关键词（会话标题 / 问题 / 回答，参数化 ILIKE + pg_trgm GIN 索引）、起止日期（按用户时区的自然日，
 *        左闭右开）、知识点（message_concepts，可多选）、学科；任意组合；分页；匹配片段高亮。
 *  权限：每个子查询都带 user_id = $1；服务端过滤，前端无法越权。
 *
 *  SQL 由固定片段组合，用户输入一律作为 $n 参数传入，不做字符串拼接。
 */
import { z } from "zod";
import { q, q1 } from "@/db";
import { buildHistorySqlBaseline } from "./search/legacy";
import { searchTerms } from "./search/terms";
import { escapeLike, highlight, snippet, plainSummary, plainText, type Seg } from "./text";

export const HistoryQuery = z.object({
  keyword: z.string().trim().max(80).optional().transform((s) => (s ? s : undefined)),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conceptIds: z.array(z.string().uuid()).max(20).optional(),
  subjectId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type HistoryQuery = z.infer<typeof HistoryQuery>;

export type HistoryHit = {
  questionId: string; answerId: string | null; conversationId: string; conversationTitle: string; origin: string;
  createdAt: string; localDate: string;
  titleSegs: Seg[]; questionSegs: Seg[]; answerSummary: string; answerSegs: Seg[] | null; answerStatus: string | null;
  matchedIn: string[]; concepts: { id: string; name: string; status: string }[];
};

/** 生成核心检索 SQL（导出以便报告与 EXPLAIN 使用同一份语句） */
export function buildHistorySql(input: HistoryQuery, userId: string, tz: string, indexed = true) {
  if (!indexed) return buildHistorySqlBaseline(input,userId,tz);
  const params: unknown[] = [userId, tz];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = ["qm.user_id = $1", "qm.role = 'user'", "c.archived_at IS NULL"];
  let candidate = "";
  if (input.keyword) {
    const kw = p(`%${escapeLike(input.keyword)}%`);
    const allTerms=searchTerms(input.keyword);
    const chineseTerms=allTerms.filter(t=>/^[一-龥]{2}$/.test(t));
    const chinese=chineseTerms.length>0;
    const terms=chinese?chineseTerms:allTerms;
    const tp=p(terms);
    // 含连续中文的查询先取中文二元组交集，再用完整ILIKE复核字序/数字/标点。
    const postings=terms.length ? `SELECT m.id AS mid, mt.weight AS evidence FROM message_terms mt JOIN messages m ON m.id=mt.message_id
      WHERE mt.term=${terms.length===1 ? `(${tp}::text[])[1]` : `(SELECT wanted.term FROM unnest(${tp}::text[]) wanted(term)
        ORDER BY (SELECT count(*) FROM message_terms counted WHERE counted.term=wanted.term), wanted.term LIMIT 1)`}
      AND m.user_id=$1 AND NOT EXISTS (
        SELECT 1 FROM unnest(${tp}::text[]) wanted(term) WHERE NOT EXISTS (
          SELECT 1 FROM message_terms other WHERE other.term=wanted.term AND other.message_id=m.id))`
      : `SELECT id AS mid, 0::real AS evidence FROM messages WHERE false AND cardinality(${tp}::text[])>=0`;

    candidate=`posted AS (${postings}),
      matching_concepts AS MATERIALIZED (
        SELECT k.id FROM concepts k WHERE (k.owner_user_id IS NULL OR k.owner_user_id=$1)
        AND (k.name ILIKE ${kw} ESCAPE '\\' OR EXISTS(SELECT 1 FROM concept_aliases ca WHERE ca.concept_id=k.id AND ca.alias ILIKE ${kw} ESCAPE '\\'))
      ),
      matched AS (
        SELECT CASE WHEN m.role='user' THEN m.id ELSE m.reply_to_id END AS qid, ${chinese ? '3::real+least(posted.evidence,8)::real/100' : '3::real'} AS score
        FROM ${chinese ? "posted JOIN messages m ON m.id=posted.mid" : "messages m"}
        JOIN conversations cv ON cv.id=m.conversation_id AND cv.user_id=m.user_id
        WHERE m.user_id=$1 AND (m.content ILIKE ${kw} ESCAPE '\\' OR cv.title ILIKE ${kw} ESCAPE '\\')
        ${!chinese&&terms.length ? `UNION ALL SELECT CASE WHEN m.role='user' THEN m.id ELSE m.reply_to_id END, 2::real+least(posted.evidence,8)::real/100
          FROM posted JOIN messages m ON m.id=posted.mid WHERE m.user_id=$1` : ""}
        UNION ALL
        SELECT CASE WHEN m.role='user' THEN m.id ELSE m.reply_to_id END, 1::real
        FROM message_concepts mc JOIN messages m ON m.id=mc.message_id
        JOIN matching_concepts k ON k.id=mc.concept_id
        WHERE m.user_id=$1 AND mc.status<>'rejected'
      ), cand AS (SELECT qid,max(score)+count(DISTINCT score)::real/4 AS score FROM matched GROUP BY qid),`;
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
         c.title, c.origin, ${input.keyword ? "cand.score" : "0::real"} AS relevance, am.id AS answer_id, am.content AS answer, am.status AS answer_status
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
ORDER BY b.relevance DESC, b.created_at DESC, b.question_id DESC
LIMIT ${limit} OFFSET ${offset}`;
  return { text, params };
}

export async function searchHistory(userId: string, tz: string, input: HistoryQuery) {
  const installed=!!(await q1(`SELECT to_regclass('public.message_terms') IS NOT NULL AS ready`))?.ready;
  const { text, params } = buildHistorySql(input, userId, tz, installed);
  const rows = await q(text, params);
  const ids = rows.flatMap((r) => [r.question_id, r.answer_id].filter(Boolean));
  const tagRows = ids.length
    ? await q(`SELECT mc.message_id, k.id, k.name, mc.status FROM message_concepts mc JOIN concepts k ON k.id = mc.concept_id
               JOIN messages m ON m.id = mc.message_id
               WHERE mc.message_id = ANY($1::uuid[]) AND m.user_id = $2 AND mc.status <> 'rejected'`, [ids, userId])
    : [];
  const kws = input.keyword ? [input.keyword, ...searchTerms(input.keyword)] : [];
  const hits: HistoryHit[] = rows.map((r) => {
    const lower = (s: string | null) => (s ?? "").toLowerCase();
    const kw = (input.keyword ?? "").toLowerCase();
    const matchedIn = kw ? [
      lower(r.title).includes(kw) && "title",
      lower(r.question).includes(kw) && "question",
      lower(r.answer).includes(kw) && "answer",
    ].filter(Boolean) as string[] : [];
    const tags = new Map<string, { id: string; name: string; status: string }>();
    for (const t of tagRows) if (t.message_id === r.question_id || t.message_id === r.answer_id) {
      const prev = tags.get(t.id);
      if (!prev || t.status === "confirmed") tags.set(t.id, { id: t.id, name: t.name, status: t.status });
    }
    return {
      questionId: r.question_id, answerId: r.answer_id, conversationId: r.conversation_id, conversationTitle: r.title, origin: r.origin,
      createdAt: r.created_at, localDate: r.local_time,
      titleSegs: highlight(r.title, kws),
      questionSegs: snippet(r.question, kws, 60),
      answerSummary: r.answer ? plainSummary(r.answer, 80) : "",
      answerSegs: r.answer && matchedIn.includes("answer") && plainText(r.answer).toLowerCase().includes(kw) ? snippet(plainText(r.answer), kws, 50) : null,
      answerStatus: r.answer_status,
      matchedIn, concepts: [...tags.values()],
    };
  });
  const total = rows.length ? Number(rows[0].total) : 0;
  return { hits, total, searchMode: installed ? "inverted" : "legacy", page: input.page, pageSize: input.pageSize, pages: Math.max(1, Math.ceil(total / input.pageSize)), timezone: tz };
}

/** 会话列表 */
export async function listConversations(userId: string, limit = 50) {
  return q(
    `SELECT c.id, c.title, c.origin, c.updated_at AS "updatedAt", c.created_at AS "createdAt", s.name AS "subjectName",
            (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.user_id = c.user_id)::int AS "messageCount"
     FROM conversations c LEFT JOIN subjects s ON s.id = c.subject_id
     WHERE c.user_id = $1 AND c.archived_at IS NULL
     ORDER BY c.updated_at DESC LIMIT $2`,
    [userId, limit],
  );
}
