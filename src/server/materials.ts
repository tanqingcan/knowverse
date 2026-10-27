/**
 * 资料温室：文件校验 → 提取 → 保存版本 → 分块 → 建立索引（pg_trgm）→ 候选概念确认 → 可引用答疑
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { q, q1, withTx } from "@/db";
import { AppError, notFound } from "./errors";
import { detectType, extractContent, MAX_UPLOAD_BYTES } from "./extract";
import { matchConcepts, visibleConcepts } from "./concepts";
import { escapeLike } from "./text";
import { addEvidence } from "./growth";

/** 可读资料：课程公共资料（owner 为空）+ 本人资料 */
const VISIBLE = `(m.owner_user_id IS NULL OR m.owner_user_id = $1) AND m.archived_at IS NULL`;

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
  const chunks = v ? await q(`SELECT id, ord, page_no AS "pageNo", paragraph_no AS "paragraphNo", heading, content
                              FROM material_chunks WHERE version_id = $1 ORDER BY ord`, [v.id]) : [];
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
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./storage/uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const storageName = `${sha.slice(0, 16)}-${inp.fileName.replace(/[^\w.\-一-龥]/g, "_")}`;
  await fs.writeFile(path.join(uploadDir, storageName), inp.buf);

  // 事务 1：登记资料与新版本（状态 processing）
  const { materialId, versionId, versionNo } = await withTx(async (c) => {
    let materialId = inp.materialId;
    if (materialId) {
      const own = await c.query(`SELECT id FROM materials WHERE id = $1 AND owner_user_id IS NOT DISTINCT FROM $2 FOR UPDATE`, [materialId, inp.userId]);
      if (!own.rowCount) throw notFound("资料");
      const latest = await c.query(`SELECT sha256 FROM material_versions WHERE material_id = $1 ORDER BY version_no DESC LIMIT 1`, [materialId]);
      if (latest.rows[0]?.sha256 === sha) throw new AppError("same_version", "内容与当前最新版本完全相同，未创建新版本");
    } else {
      const r = await c.query(`INSERT INTO materials (owner_user_id, subject_id, title, course, kind) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [inp.userId, inp.subjectId, inp.title, inp.course, inp.kind]);
      materialId = r.rows[0].id as string;
    }
    const v = await c.query(
      `INSERT INTO material_versions (material_id, version_no, file_name, file_type, mime_type, byte_size, sha256, storage_path, status, uploaded_by_user_id)
       VALUES ($1, (SELECT coalesce(max(version_no), 0) + 1 FROM material_versions WHERE material_id = $1), $2, $3, $4, $5, $6, $7, 'processing', $8)
       RETURNING id, version_no`,
      [materialId, inp.fileName, det.type, inp.mimeType, inp.buf.length, sha, storageName, inp.userId]);
    return { materialId: materialId!, versionId: v.rows[0].id as string, versionNo: v.rows[0].version_no as number };
  });

  // 提取放在事务外（可能较慢）
  const res = await extractContent(det.type, inp.buf);

  // 事务 2：写入片段与状态、候选概念
  const subj = await q1<{ subject_id: string }>(`SELECT subject_id FROM materials WHERE id = $1`, [materialId]);
  const concepts = await visibleConcepts(inp.userId ?? "00000000-0000-0000-0000-000000000000", [subj!.subject_id]);
  await withTx(async (c) => {
    let ord = 0;
    const hits = new Map<string, number>();
    for (const ch of res.chunks) {
      ord += 1;
      await c.query(`INSERT INTO material_chunks (version_id, ord, page_no, paragraph_no, heading, content) VALUES ($1,$2,$3,$4,$5,$6)`,
        [versionId, ord, ch.pageNo, ch.paragraphNo, ch.heading, ch.content]);
      for (const m of matchConcepts(ch.content, concepts)) hits.set(m.conceptId, (hits.get(m.conceptId) ?? 0) + 1);
    }
    for (const [conceptId, n] of hits) {
      await c.query(`INSERT INTO material_concepts (version_id, concept_id, status, hit_count) VALUES ($1,$2,'candidate',$3)`, [versionId, conceptId, n]);
    }
    await c.query(`UPDATE material_versions SET status = $2, status_detail = $3, page_count = $4, processed_at = now() WHERE id = $1`,
      [versionId, res.status, res.detail, res.pageCount]);
  });
  return { materialId, versionId, versionNo, status: res.status, detail: res.detail, chunkCount: res.chunks.length };
}

export async function setMaterialConcept(userId: string, versionId: string, conceptId: string, status: "confirmed" | "rejected") {
  const r = await q(`UPDATE material_concepts mc SET status = $4
                     FROM material_versions v JOIN materials m ON m.id = v.material_id
                     WHERE mc.version_id = v.id AND v.id = $2 AND mc.concept_id = $3 AND ${VISIBLE}
                     RETURNING mc.concept_id`, [userId, versionId, conceptId, status]);
  if (!r.length) throw notFound("候选概念");
  return { ok: true };
}

/** 用户标记“读过这份资料中关于某知识点的内容”——记为阅读证据 */
export async function markRead(userId: string, versionId: string, conceptId: string) {
  const v = await q1(`SELECT v.id, m.title, v.version_no FROM material_versions v JOIN materials m ON m.id = v.material_id WHERE v.id = $2 AND ${VISIBLE}`, [userId, versionId]);
  if (!v) throw notFound("资料版本");
  return withTx((c) => addEvidence(c, {
    userId, conceptId, kind: "read", materialVersionId: versionId, detail: `阅读《${v.title}》v${v.version_no}`,
  }));
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
  pageNo: number | null; paragraphNo: number | null; heading: string | null; content: string; score: number;
};

export function locationLabel(h: { fileType: string; pageNo: number | null; paragraphNo: number | null }) {
  if (h.pageNo != null) return h.fileType === "pptx" ? `第 ${h.pageNo} 页幻灯片` : `第 ${h.pageNo} 页`;
  if (h.paragraphNo != null) return `第 ${h.paragraphNo} 段`;
  return "全文";
}

export async function searchMaterials(userId: string, query: string, opts: { subjectIds?: string[]; conceptIds?: string[]; limit?: number } = {}): Promise<{ terms: string[]; hits: MaterialHit[] }> {
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
