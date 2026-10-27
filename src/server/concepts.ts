/**
 * 知识点识别：只“提出候选”，不随意合并或新建用户已有知识点。
 * 匹配基于规范化名称与学科语境下的别名（concept_aliases）。
 */
import type { PoolClient } from "pg";
import { q, q1 } from "@/db";
import { normName } from "./text";
import { AppError } from "./errors";

export type ConceptRow = { id: string; subjectId: string; name: string; norm: string; aliases: string[]; subjectName: string };

/** 用户可见的知识点：公共目录 + 本人创建，限定在给定学科 */
export async function visibleConcepts(userId: string, subjectIds?: string[]): Promise<ConceptRow[]> {
  const rows = await q<ConceptRow>(
    `SELECT c.id, c.subject_id AS "subjectId", c.name, c.name_norm AS norm, s.name AS "subjectName",
            coalesce(array_agg(a.alias_norm) FILTER (WHERE a.id IS NOT NULL), '{}') AS aliases
     FROM concepts c
     JOIN subjects s ON s.id = c.subject_id
     LEFT JOIN concept_aliases a ON a.concept_id = c.id
     WHERE c.archived_at IS NULL AND (c.owner_user_id IS NULL OR c.owner_user_id = $1)
       AND ($2::uuid[] IS NULL OR c.subject_id = ANY($2::uuid[]))
     GROUP BY c.id, s.name`,
    [userId, subjectIds?.length ? subjectIds : null],
  );
  return rows;
}

export type ConceptMatch = { conceptId: string; name: string; subjectId: string; matchedBy: string; confidence: number };

/**
 * 在文本中查找已有知识点。若某个匹配词是另一个更长匹配词的子串（如 “join” 与 “left join”），
 * 只保留更长者，避免“左外连接”的问题同时被标成“内连接”。
 */
export function matchConcepts(text: string, concepts: ConceptRow[]): ConceptMatch[] {
  const t = normName(text);
  const hits: { c: ConceptRow; term: string }[] = [];
  for (const c of concepts) {
    const terms = [c.norm, ...c.aliases].filter((x) => x && x.length >= 2);
    let best = "";
    for (const term of terms) if (t.includes(term) && term.length > best.length) best = term;
    if (best) hits.push({ c, term: best });
  }
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.term.length > h.term.length && o.term.includes(h.term)));
  return kept.map((h) => ({
    conceptId: h.c.id, name: h.c.name, subjectId: h.c.subjectId, matchedBy: h.term,
    confidence: h.term === h.c.norm ? 0.9 : 0.75,
  }));
}

/** 用户主动新建个人知识点（AI 候选被用户接受时也走这里）。同名时返回已有知识点而不是重复创建。 */
export async function createUserConcept(c: PoolClient | undefined, userId: string, subjectId: string, name: string) {
  const n = normName(name);
  if (n.length < 1 || name.trim().length > 40) throw new AppError("bad_concept", "知识点名称需为 1–40 个字符");
  const existing = await q1<{ id: string }>(
    `SELECT c.id FROM concepts c LEFT JOIN concept_aliases a ON a.concept_id = c.id
     WHERE c.subject_id = $1 AND (c.owner_user_id IS NULL OR c.owner_user_id = $2) AND (c.name_norm = $3 OR a.alias_norm = $3)
     LIMIT 1`, [subjectId, userId, n], c);
  if (existing) return { id: existing.id, created: false };
  const row = await q1<{ id: string }>(
    `INSERT INTO concepts (subject_id, owner_user_id, name, name_norm) VALUES ($1, $2, $3, $4) RETURNING id`,
    [subjectId, userId, name.trim(), n], c);
  return { id: row!.id, created: true };
}

/** 先修闭包（递归 CTE，带路径数组做循环保护） */
export async function prerequisiteClosure(conceptIds: string[]) {
  return q<{ conceptId: string; prereqId: string; depth: number }>(
    `WITH RECURSIVE pre(concept_id, prereq_id, depth, path) AS (
        SELECT cp.concept_id, cp.prereq_concept_id, 1, ARRAY[cp.concept_id, cp.prereq_concept_id]
        FROM concept_prerequisites cp WHERE cp.concept_id = ANY($1::uuid[])
      UNION ALL
        SELECT pre.concept_id, cp.prereq_concept_id, pre.depth + 1, pre.path || cp.prereq_concept_id
        FROM pre JOIN concept_prerequisites cp ON cp.concept_id = pre.prereq_id
        WHERE NOT cp.prereq_concept_id = ANY(pre.path) AND pre.depth < 12
     )
     SELECT concept_id AS "conceptId", prereq_id AS "prereqId", min(depth) AS depth
     FROM pre GROUP BY concept_id, prereq_id`,
    [conceptIds],
  );
}
