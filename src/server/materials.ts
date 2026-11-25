/**
 * 资料温室：文件校验 → 提取 → 保存版本 → 分块 → 建立索引（pg_trgm）→ 候选概念确认 → 可引用答疑
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { q, q1, withTx } from "@/db";
import { AppError, notFound } from "./errors";
import { detectType, extractContent, MAX_UPLOAD_BYTES } from "./extract";
import { matchConcepts, visibleConcepts, type ConceptRow } from "./concepts";
import { escapeLike } from "./text";
import { rankMaterials } from "./retrieval/rank";
import { encode, fuseRecall, mergeRecall, semanticPort } from "./retrieval/semantic";
import { indexEmbeddings, storeChunkConcepts } from "./retrieval/material-index";
import { addEvidence } from "./growth";

/** 可读资料：课程公共资料（owner 为空）+ 本人资料 */
const VISIBLE = `(m.owner_user_id IS NULL OR m.owner_user_id = $1) AND m.archived_at IS NULL`;

const uploadRoot = () => path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./storage/uploads");

export async function loadMaterialFile(userId: string, materialId: string, versionNo: number) {
  const file = await q1<{ name: string; key: string | null }>(`SELECT v.file_name AS name, v.storage_path AS key
    FROM material_versions v JOIN materials m ON m.id = v.material_id
    WHERE m.id = $2 AND v.version_no = $3 AND v.status <> 'processing' AND ${VISIBLE}`,
  [userId, materialId, versionNo]);
  // Existing uploads use a single filename, new uploads use an owner directory and version UUID.
  if (!file?.key || !/^(?:[0-9a-f]{16}-[\w.\-一-龥]+|(?:public|[0-9a-f-]{36})\/[0-9a-f-]{36})$/i.test(file.key)) throw notFound("原文件");
  try {
    return { name: file.name, content: await fs.readFile(path.join(uploadRoot(), file.key)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw notFound("原文件");
    throw error;
  }
}

export async function listMaterials(userId: string) {
  return q(
    `SELECT m.id, m.title, m.course, m.kind, m.owner_user_id IS NULL AS "isPublic", s.name AS "subjectName", m.subject_id AS "subjectId",
            v.id AS "versionId", v.version_no AS "versionNo", v.file_name AS "fileName", v.file_type AS "fileType",
            v.byte_size AS "byteSize", v.status, v.status_detail AS "statusDetail", v.page_count AS "pageCount", v.uploaded_at AS "uploadedAt",
            (SELECT count(*) FROM material_chunks ch WHERE ch.version_id = v.id)::int AS "chunkCount",
            (SELECT count(*) FROM material_versions v2 WHERE v2.material_id = m.id)::int AS "versionCount"
     FROM materials m JOIN subjects s ON s.id = m.subject_id
     JOIN LATERAL (SELECT * FROM material_versions v WHERE v.material_id = m.id ORDER BY v.version_no DESC LIMIT 1) v ON true
     WHERE ${VISIBLE}
     ORDER BY v.uploaded_at DESC`,
    [userId],
  );
}

export async function materialDetail(userId: string, materialId: string, versionNo?: number) {
  const m = await q1(`SELECT m.id, m.title, m.course, m.kind, m.subject_id AS "subjectId", m.owner_user_id IS NULL AS "isPublic", s.name AS "subjectName"
                      FROM materials m JOIN subjects s ON s.id = m.subject_id WHERE m.id = $2 AND ${VISIBLE}`, [userId, materialId]);
  if (!m) throw notFound("资料");
  const versions = await q(`SELECT id, version_no AS "versionNo", file_name AS "fileName", file_type AS "fileType", byte_size AS "byteSize",
                                   sha256, status, status_detail AS "statusDetail", page_count AS "pageCount", uploaded_at AS "uploadedAt"
                            FROM material_versions WHERE material_id = $1 ORDER BY version_no DESC`, [materialId]);
  const v = versionNo ? versions.find((x) => x.versionNo === versionNo) : versions[0];
  const chunks = v ? await q(`SELECT ch.id, ch.ord, ch.page_no AS "pageNo", ch.paragraph_no AS "paragraphNo", ch.heading, ch.content,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'source', link.source,
            'status', link.status, 'matchedTerm', link.matched_term) ORDER BY k.name)
        FROM material_chunk_concepts link JOIN concepts k ON k.id = link.concept_id
        WHERE link.chunk_id = ch.id AND k.archived_at IS NULL AND (k.owner_user_id IS NULL OR k.owner_user_id = $2)),
        '[]'::jsonb) AS "conceptLinks"
    FROM material_chunks ch WHERE ch.version_id = $1 ORDER BY ch.ord`, [v.id, userId]) : [];
  const concepts = v ? await q(`SELECT k.id, k.name, mc.status, mc.hit_count AS "hitCount" FROM material_concepts mc JOIN concepts k ON k.id = mc.concept_id
                                WHERE mc.version_id = $1 ORDER BY mc.hit_count DESC`, [v.id]) : [];
  const citedBy = v ? await q(`SELECT count(*)::int AS n FROM message_citations mc JOIN material_chunks ch ON ch.id = mc.chunk_id
                               JOIN messages msg ON msg.id = mc.message_id WHERE ch.version_id = $1 AND msg.user_id = $2`, [v.id, userId]) : [];
  return { material: m, versions, version: v ?? null, chunks, concepts, citedByMyMessages: citedBy[0]?.n ?? 0 };
}

export type UploadInput = {
  userId: string | null; // null = 公共课程资料（仅 seed 使用）
  subjectId: string; title: string; course: string; kind: string;
  fileName: string; mimeType: string | null; buf: Buffer; materialId?: string;
};

export async function uploadMaterial(inp: UploadInput) {
  if (inp.buf.length === 0) throw new AppError("empty_file", "文件为空");
  if (inp.buf.length > MAX_UPLOAD_BYTES) throw new AppError("too_large", `文件超过 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB 上限`);
  const det = detectType(inp.fileName, inp.buf);
  if (det.problem) throw new AppError("bad_file", det.problem);
  const sha = crypto.createHash("sha256").update(inp.buf).digest("hex");
  const versionId = crypto.randomUUID();
  const storageName = `${inp.userId ?? "public"}/${versionId}`;

  // 事务 1：登记资料与新版本（状态 processing）
  const { materialId, versionNo } = await withTx(async (c) => {
    let materialId = inp.materialId;
    if (materialId) {
      const own = await c.query(`SELECT id FROM materials WHERE id = $1 AND owner_user_id IS NOT DISTINCT FROM $2 FOR UPDATE`, [materialId, inp.userId]);
      if (!own.rowCount) throw notFound("资料");
      const latest = await c.query(`SELECT sha256, status FROM material_versions WHERE material_id = $1 ORDER BY version_no DESC LIMIT 1`, [materialId]);
      if (latest.rows[0]?.sha256 === sha && latest.rows[0].status !== "failed") {
        throw new AppError("same_version", "内容与当前最新版本完全相同，未创建新版本");
      }
    } else {
      const subject = await c.query(`SELECT id FROM subjects WHERE id = $1
        AND (owner_user_id IS NULL OR owner_user_id = $2)`, [inp.subjectId, inp.userId]);
      if (!subject.rowCount) throw notFound("学科");
      const r = await c.query(`INSERT INTO materials (owner_user_id, subject_id, title, course, kind) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [inp.userId, inp.subjectId, inp.title, inp.course, inp.kind]);
      materialId = r.rows[0].id as string;
    }
    const v = await c.query(
      `INSERT INTO material_versions (material_id, version_no, file_name, file_type, mime_type, byte_size, sha256, storage_path, status, uploaded_by_user_id, id)
       VALUES ($1, (SELECT coalesce(max(version_no), 0) + 1 FROM material_versions WHERE material_id = $1), $2, $3, $4, $5, $6, $7, 'processing', $8, $9)
       RETURNING version_no`,
      [materialId, inp.fileName, det.type, inp.mimeType, inp.buf.length, sha, storageName, inp.userId, versionId]);
    return { materialId: materialId!, versionNo: v.rows[0].version_no as number };
  });

  const filePath = path.join(uploadRoot(), storageName);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, inp.buf, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") await fs.unlink(filePath).catch(() => {});
    await q("UPDATE material_versions SET status = 'failed', status_detail = $2, processed_at = now() WHERE id = $1",
      [versionId, "原文件保存失败，请重试"]);
    throw new AppError("upload_storage_failed", "原文件保存失败，请重试", 500);
  }

  // 提取放在事务外（可能较慢）
  const res = await extractContent(det.type, inp.buf, inp.fileName);

  // 事务 2：写入片段与状态、候选概念
  const subj = await q1<{ subject_id: string }>(`SELECT subject_id FROM materials WHERE id = $1`, [materialId]);
  const concepts = await visibleConcepts(inp.userId ?? "00000000-0000-0000-0000-000000000000", [subj!.subject_id]);
  await withTx(async (c) => {
    const hits = new Map<string, number>();
    const { rows: chunks } = await c.query<{ id: string; heading: string | null; content: string }>(
      `INSERT INTO material_chunks (version_id, ord, page_no, paragraph_no, heading, content, concepts_indexed_at)
       SELECT $1, r.ord, r."pageNo", r."paragraphNo", r.heading, r.content, now()
       FROM jsonb_to_recordset($2::jsonb) AS r(ord int, "pageNo" int, "paragraphNo" int, heading text, content text)
       ORDER BY r.ord RETURNING id, heading, content`,
      [versionId, JSON.stringify(res.chunks.map((ch, i) => ({ ...ch, ord: i + 1 })))]);
    await storeChunkConcepts(c, chunks, concepts);
    for (const ch of chunks) {
      for (const m of matchConcepts(ch.content, concepts)) hits.set(m.conceptId, (hits.get(m.conceptId) ?? 0) + 1);
    }
    for (const [conceptId, n] of hits) {
      await c.query(`INSERT INTO material_concepts (version_id, concept_id, status, hit_count) VALUES ($1,$2,'candidate',$3)`, [versionId, conceptId, n]);
    }
    await c.query(`UPDATE material_versions SET status = $2, status_detail = $3, page_count = $4, processed_at = now() WHERE id = $1`,
      [versionId, res.status, res.detail, res.pageCount]);
  });
  if (res.status === "ready" && semanticPort()) {
    // Remaining or failed batches are picked up by the index worker.
    await indexEmbeddings({ versionId, maxBatches: 1 }).catch(() => {
      console.warn("资料向量暂未写入，等待索引任务重试", versionId);
    });
  }
  return { materialId, versionId, versionNo, status: res.status, detail: res.detail, chunkCount: res.chunks.length };
}

export async function setMaterialConcept(userId: string, versionId: string, conceptId: string, status: "confirmed" | "rejected") {
  const r = await q(`UPDATE material_concepts mc SET status = $4
                     FROM material_versions v JOIN materials m ON m.id = v.material_id
                     WHERE mc.version_id = v.id AND v.id = $2 AND mc.concept_id = $3
                       AND m.owner_user_id = $1 AND m.archived_at IS NULL
                     RETURNING mc.concept_id`, [userId, versionId, conceptId, status]);
  if (!r.length) throw notFound("候选概念");
  return { ok: true };
}

export async function reviewChunkConcept(userId: string, chunkId: string, conceptId: string, status: "confirmed" | "rejected") {
  const row = await q1(`INSERT INTO material_chunk_concepts (chunk_id, concept_id, source, status, reviewed_at)
    SELECT ch.id, k.id, 'user', $4, now()
    FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id JOIN concepts k ON k.id = $3 AND k.subject_id = m.subject_id
    WHERE ch.id = $2 AND m.owner_user_id = $1 AND m.archived_at IS NULL AND v.status = 'ready'
      AND k.archived_at IS NULL AND (k.owner_user_id IS NULL OR k.owner_user_id = $1)
      AND ($4 = 'confirmed' OR EXISTS (
        SELECT 1 FROM material_chunk_concepts mc WHERE mc.chunk_id = ch.id AND mc.concept_id = k.id))
    ON CONFLICT (chunk_id, concept_id) DO UPDATE SET status = excluded.status, reviewed_at = excluded.reviewed_at
    RETURNING status`, [userId, chunkId, conceptId, status]);
  if (!row) throw notFound("资料片段或同学科知识点");
  return row;
}

/** 用户标记“读过这份资料中关于某知识点的内容”——记为阅读证据 */
export async function markRead(userId: string, versionId: string, conceptId: string) {
  return withTx(async c => {
    const source = await q1(`SELECT m.title, v.version_no FROM material_versions v
      JOIN materials m ON m.id = v.material_id
      JOIN material_concepts mc ON mc.version_id = v.id
      WHERE v.id = $2 AND mc.concept_id = $3 AND mc.status = 'confirmed' AND ${VISIBLE}
      FOR SHARE OF mc`, [userId, versionId, conceptId], c);
    if (!source) throw notFound("资料版本中已确认的知识点");
    return addEvidence(c, {
      userId, conceptId, kind: "read", materialVersionId: versionId, detail: `阅读《${source.title}》v${source.version_no}`,
    });
  });
}

/* ───────── 检索（search_materials 工具） ───────── */

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
  ord?: number; pageNo: number | null; paragraphNo: number | null; heading: string | null; content: string; score: number;
};

export function locationLabel(h: { fileType: string; pageNo: number | null; paragraphNo: number | null }) {
  if (h.pageNo != null) return h.fileType === "pptx" ? `第 ${h.pageNo} 页幻灯片` : `第 ${h.pageNo} 页`;
  if (h.paragraphNo != null) return `第 ${h.paragraphNo} 段`;
  return "全文";
}

// The lexical and semantic paths share the same owner, course, version and status scope.
const LATEST_READY = `WITH latest AS (
  SELECT DISTINCT ON (v.material_id) v.id, v.version_no, v.material_id, v.file_type, m.title
  FROM material_versions v JOIN materials m ON m.id = v.material_id
  WHERE ${VISIBLE} AND v.status = 'ready' AND ($2::uuid[] IS NULL OR m.subject_id = ANY($2::uuid[]))
  ORDER BY v.material_id, v.version_no DESC
)`;
const MATERIAL_FIELDS = `ch.id AS "chunkId", l.id AS "versionId", l.version_no AS "versionNo",
  l.material_id AS "materialId", l.title AS "materialTitle", l.file_type AS "fileType",
  ch.page_no AS "pageNo", ch.paragraph_no AS "paragraphNo", ch.heading, ch.content, ch.ord`;

type ConceptHit = MaterialHit & { status: "confirmed" | "candidate"; source: "catalog" | "user" };
export async function findConceptPassages(userId: string, conceptIds: string[], subjectIds: string[] | null = null, limit = 60) {
  const rows = await q<ConceptHit>(`${LATEST_READY}
    SELECT ${MATERIAL_FIELDS}, hit.status, hit.source, 0 AS score
    FROM material_chunks ch JOIN latest l ON l.id = ch.version_id
    JOIN LATERAL (
      SELECT link.status, link.source FROM material_chunk_concepts link JOIN concepts k ON k.id = link.concept_id
      WHERE link.chunk_id = ch.id AND link.concept_id = ANY($3::uuid[]) AND link.status <> 'rejected'
        AND k.archived_at IS NULL AND (k.owner_user_id IS NULL OR k.owner_user_id = $1)
      ORDER BY (link.status = 'confirmed') DESC, link.concept_id LIMIT 1
    ) hit ON true
    ORDER BY (hit.status = 'confirmed') DESC, l.title, l.material_id, ch.ord LIMIT $4`,
    [userId, subjectIds, conceptIds, limit]);
  return rows;
}

type SearchOptions = { subjectIds?: string[]; conceptIds?: string[]; limit?: number };
async function lexicalPassages(userId: string, query: string, concepts: ConceptRow[], opts: SearchOptions, limit: number) {
  const matched = matchConcepts(query, concepts).map((m) => m.conceptId);
  const requested = new Set([...matched, ...(opts.conceptIds ?? [])]);
  const ids = concepts.filter(c => requested.has(c.id)).map(c => c.id);
  const termRows = ids.length
    ? await q<{ cid: string; t: string }>(`SELECT id AS cid, name AS t FROM concepts WHERE id = ANY($1::uuid[]) UNION SELECT concept_id, alias FROM concept_aliases WHERE concept_id = ANY($1::uuid[])`, [ids])
    : [];
  const conceptGroups = ids.map((id) => termRows.filter((r) => r.cid === id).map((r) => r.t));
  const conceptTerms = termRows.map((r) => r.t);
  // 常见定义问句与明确引用的术语优先按整词查找，无需先建知识点。
  const phrases = [...query.matchAll(/“([^”]{2,80})”|"([^"]{2,80})"/g)]
    .map(m => (m[1] ?? m[2]).trim()).filter(t => t.length >= 2);
  const question = query.trim().replace(/[？?。]+$/, "").trim();
  const definition = question.match(/^(?:请问\s*)?(?:什么是|请解释|解释一下)\s*(.+)$/u)?.[1]
    ?? question.match(/^(.+?)\s*是什么$/u)?.[1];
  const term = definition?.trim();
  if (term && /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u.test(term) && !STOP.has(term.toLowerCase())) phrases.push(term);
  const { terms, groups } = extractTerms(query, [...phrases.map(t => [t]), ...conceptGroups]);
  const scope = [userId, opts.subjectIds?.length ? opts.subjectIds : null];
  const patterns = terms.map((t) => `%${escapeLike(t)}%`);
  const strongTerms = [...phrases, ...conceptTerms];
  const strongPatterns = strongTerms.map(t => `%${escapeLike(t)}%`);
  const rows = terms.length ? await q<MaterialHit>(
    `${LATEST_READY}
     SELECT ${MATERIAL_FIELDS}, matches.body_groups AS score
     FROM material_chunks ch JOIN latest l ON l.id = ch.version_id
     CROSS JOIN LATERAL (
       SELECT count(DISTINCT g) FILTER (WHERE ch.content ILIKE p)::int AS body_groups,
              count(DISTINCT g) FILTER (WHERE ch.heading ILIKE p)::int AS heading_groups
       FROM unnest($3::text[], $5::int[]) AS term(p,g)
     ) matches
     WHERE ch.content ILIKE ANY($3::text[]) OR ch.heading ILIKE ANY($3::text[])
     ORDER BY matches.body_groups DESC, (ch.content ILIKE ANY($6::text[])) DESC,
              matches.heading_groups DESC, l.material_id, ch.ord
     LIMIT $4`,
    [...scope, patterns, 40, groups, strongPatterns],
  ) : [];
  return { terms, ids, hits: rankMaterials(rows, terms, groups, strongTerms, limit) };
}

async function vectorPassages(userId: string, subjects: string[] | null, modelKey: string, queryVector: number[], limit: number) {
  return withTx(async tx => {
    await tx.query("SET LOCAL statement_timeout = '1000ms'");
    return q<MaterialHit>(`${LATEST_READY}, scoped AS MATERIALIZED (
    SELECT ${MATERIAL_FIELDS}, em.embedding
    FROM material_chunks ch JOIN latest l ON l.id = ch.version_id
    JOIN material_chunk_embeddings em ON em.chunk_id = ch.id AND em.model_key = $3
  ), ranked AS MATERIALIZED (
    SELECT scoped.*, kv_material_dot(embedding, $4::real[]) AS score FROM scoped
  )
  SELECT "chunkId", "versionId", "versionNo", "materialId", "materialTitle", "fileType",
    "pageNo", "paragraphNo", heading, content, ord, score
  FROM ranked WHERE score >= 0.55 ORDER BY score DESC, "chunkId" LIMIT $5`,
    [userId, subjects, modelKey, queryVector, limit], tx);
  });
}

export async function searchMaterials(userId: string, query: string, opts: SearchOptions = {}): Promise<{
  terms: string[]; hits: MaterialHit[]; semantic: "off" | "used" | "unavailable"
}> {
  const concepts = await visibleConcepts(userId, opts.subjectIds);
  const limit = opts.limit ?? 4;
  const candidateLimit = Math.max(12, limit * 2);
  const subjects = opts.subjectIds?.length ? opts.subjectIds : null;
  const parts = query.split(/[；;]|[，,](?=\s*(?:再说|再讲|另外说明))/).map(text => text.trim()).filter(text => text.length >= 6).slice(0, 3);
  const questions = parts.length > 1 ? parts : [query.trim()];
  const port = semanticPort();
  const encoded = port && query.trim().length >= 6
    ? encode(port, "query", questions.map(part => part.slice(0, 500)), 1600).catch(() => null)
    : null;
  const lexical = await Promise.all(questions.map(part => lexicalPassages(userId, part, concepts, opts, candidateLimit)));
  const vectors = await encoded;
  const vectorLanes = vectors ? await Promise.all(vectors.vectors.map(vector =>
    vectorPassages(userId, subjects, vectors.modelKey, vector, candidateLimit))).catch(() => null) : null;
  const lanes = await Promise.all(lexical.map(async (part, i) => {
    const links = part.ids.length ? await findConceptPassages(userId, part.ids, subjects, candidateLimit) : [];
    return fuseRecall([
      { rows: part.hits, weight: 2 },
      { rows: links.filter(hit => hit.status === "confirmed"), weight: 1 },
      { rows: vectorLanes?.[i] ?? [], weight: 1 },
      { rows: links.filter(hit => hit.status === "candidate"), weight: 0.4 },
    ], candidateLimit);
  }));
  return {
    terms: [...new Set(lexical.flatMap(part => part.terms))],
    hits: mergeRecall(lanes, limit),
    semantic: vectorLanes ? "used" : encoded ? "unavailable" : "off",
  };
}
