// C4固定基线：修改前的检索算法，仅用于离线评测。
import {q} from "../src/db";
import {visibleConcepts,matchConcepts} from "../src/server/concepts";
import {escapeLike} from "../src/server/text";
const VISIBLE = `(m.owner_user_id IS NULL OR m.owner_user_id = $1) AND m.archived_at IS NULL`;
const STOP = new Set(["什么", "怎么", "为什么", "如何", "可以", "一个", "这个", "那个", "我们", "你们", "他们", "就是", "还是", "以及", "如果", "因为", "所以", "但是", "是否", "有没有", "区别", "问题", "一下", "请问", "知道", "理解", "影响", "时候", "之后", "之前", "the", "and", "for", "with", "what", "how", "why"]);

/**
 * 从问题中提取检索词，分组计分：同一知识点的名称与别名算作一组（命中任意一个只计 1 分），
 * 其余英文/SQL 关键词与中文短语各自成组。避免“LEFT JOIN / left outer join / 左外连接”重复加分。
 */
export function extractTerms(query: string, conceptGroups: string[][]): { terms: string[]; groups: number[] } {
  const terms: string[] = [], groups: number[] = [];
  const seen = new Set<string>();
  const add = (t: string, g: number) => { const k = t.toLowerCase(); if (t.length >= 2 && !seen.has(k)) { seen.add(k); terms.push(t); groups.push(g); } };
  conceptGroups.forEach((g, i) => g.forEach((t) => add(t.trim(), i)));
  const conceptLower = conceptGroups.flat().map((t) => t.toLowerCase());
  const coveredByConcept = (s: string) => conceptLower.some((c) => c.includes(s.toLowerCase()));
  let gi = conceptGroups.length;
  for (const m of query.matchAll(/[A-Za-z][A-Za-z0-9_()|]*(?:\s+(?:OUTER\s+)?JOIN)?/gi)) {
    const w = m[0].trim();
    if (w.length >= 3 && !STOP.has(w.toLowerCase()) && !seen.has(w.toLowerCase())) add(w, gi++);
  }
  for (const run of query.match(/[\u4e00-\u9fa5]{2,}/g) ?? []) {
    if (run.length <= 4) { if (!STOP.has(run) && !coveredByConcept(run)) add(run, gi++); }
    else for (let i = 0; i + 4 <= run.length; i += 2) { const s = run.slice(i, i + 4); if (!STOP.has(s) && !coveredByConcept(s)) add(s, gi++); }
  }
  return { terms: terms.slice(0, 20), groups: groups.slice(0, 20) };
}

export type MaterialHit = {
  chunkId: string; versionId: string; versionNo: number; materialId: string; materialTitle: string; fileType: string;
  pageNo: number | null; paragraphNo: number | null; heading: string | null; content: string; score: number;
};

export function locationLabel(h: { fileType: string; pageNo: number | null; paragraphNo: number | null }) {
  if (h.pageNo != null) return h.fileType === "pptx" ? `第 ${h.pageNo} 页幻灯片` : `第 ${h.pageNo} 页`;
  if (h.paragraphNo != null) return `第 ${h.paragraphNo} 段`;
  return "全文";
}

export async function searchMaterialsBaseline(userId: string, query: string, opts: { subjectIds?: string[]; conceptIds?: string[]; limit?: number } = {}): Promise<{ terms: string[]; hits: MaterialHit[] }> {
  const concepts = await visibleConcepts(userId, opts.subjectIds);
  const matched = matchConcepts(query, concepts).map((m) => m.conceptId);
  const ids = [...new Set([...matched, ...(opts.conceptIds ?? [])])];
  const termRows = ids.length
    ? await q<{ cid: string; t: string }>(`SELECT id AS cid, name AS t FROM concepts WHERE id = ANY($1::uuid[]) UNION SELECT concept_id, alias FROM concept_aliases WHERE concept_id = ANY($1::uuid[])`, [ids])
    : [];
  const conceptGroups = ids.map((id) => termRows.filter((r) => r.cid === id).map((r) => r.t));
  const conceptTerms = termRows.map((r) => r.t);
  const { terms, groups } = extractTerms(query, conceptGroups);
  if (!terms.length) return { terms, hits: [] };
  const patterns = terms.map((t) => `%${escapeLike(t)}%`);
  const rows = await q<MaterialHit>(
    `WITH latest AS (
        SELECT DISTINCT ON (v.material_id) v.id, v.version_no, v.material_id, v.file_type
        FROM material_versions v JOIN materials m ON m.id = v.material_id
        WHERE ${VISIBLE} AND v.status = 'ready' AND ($3::uuid[] IS NULL OR m.subject_id = ANY($3::uuid[]))
        ORDER BY v.material_id, v.version_no DESC)
     SELECT ch.id AS "chunkId", l.id AS "versionId", l.version_no AS "versionNo", l.material_id AS "materialId", m.title AS "materialTitle",
            l.file_type AS "fileType", ch.page_no AS "pageNo", ch.paragraph_no AS "paragraphNo", ch.heading, ch.content,
            (SELECT count(DISTINCT t.g) FROM unnest($2::text[], $5::int[]) AS t(p, g) WHERE ch.content ILIKE t.p ESCAPE '\\')::int AS score,
            (SELECT count(*) FROM unnest($2::text[]) AS p WHERE ch.content ILIKE p ESCAPE '\\')::int AS raw_hits
     FROM material_chunks ch JOIN latest l ON l.id = ch.version_id JOIN materials m ON m.id = l.material_id
     WHERE ch.content ILIKE ANY($2::text[])
     ORDER BY score DESC, raw_hits DESC, length(ch.content) ASC
     LIMIT $4`,
    [userId, patterns, opts.subjectIds?.length ? opts.subjectIds : null, opts.limit ?? 4, groups],
  );
  // 至少命中 2 个检索词或命中知识点名称才算相关，避免“只撞上一个常见词”的弱引用
  const strong = rows.filter((r) => r.score >= 2 || conceptTerms.some((t) => r.content.toLowerCase().includes(t.toLowerCase())));
  return { terms, hits: strong };
}
