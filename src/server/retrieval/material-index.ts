import { q, withTx, type Tx } from "@/db";
import { matchConcepts, visibleConcepts, type ConceptRow } from "../concepts";
import { embeddingModel, encode, semanticPort } from "./semantic";

type Chunk = { id: string; heading: string | null; content: string };
type ScopedChunk = Chunk & { userId: string | null; subjectId: string };
const BATCH = 16;
const PUBLIC_USER = "00000000-0000-0000-0000-000000000000";

export async function storeChunkConcepts(tx: Tx, chunks: Chunk[], concepts: ConceptRow[]) {
  const rows = chunks.flatMap(ch => matchConcepts([ch.heading, ch.content].filter(Boolean).join("\n"), concepts)
    .map(hit => ({ chunk_id: ch.id, concept_id: hit.conceptId, term: hit.matchedBy })));
  if (!rows.length) return;
  await tx.query(`INSERT INTO material_chunk_concepts (chunk_id, concept_id, matched_term, source)
    SELECT r.chunk_id, r.concept_id, r.term, 'catalog'
    FROM jsonb_to_recordset($1::jsonb) AS r(chunk_id uuid, concept_id uuid, term text)
    ON CONFLICT (chunk_id, concept_id) DO NOTHING`, [JSON.stringify(rows)]);
}

/** Existing ready versions keep their fragment IDs. Reviewed links are never overwritten. */
export async function backfillChunkConcepts() {
  let indexed = 0;
  for (;;) {
    const rows = await q<ScopedChunk>(`SELECT ch.id, ch.heading, ch.content, m.owner_user_id AS "userId", m.subject_id AS "subjectId"
      FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
      JOIN materials m ON m.id = v.material_id
      WHERE ch.concepts_indexed_at IS NULL AND v.status = 'ready' AND m.archived_at IS NULL
      ORDER BY ch.id LIMIT 128`);
    if (rows.length === 0) return indexed;
    const groups = new Map<string, ScopedChunk[]>();
    for (const row of rows) {
      const key = `${row.userId ?? PUBLIC_USER}:${row.subjectId}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    for (const group of groups.values()) {
      const [first] = group;
      const concepts = await visibleConcepts(first.userId ?? PUBLIC_USER, [first.subjectId]);
      await withTx(async tx => {
        await storeChunkConcepts(tx, group, concepts);
        await tx.query("UPDATE material_chunks SET concepts_indexed_at = now() WHERE id = ANY($1::uuid[])", [group.map(ch => ch.id)]);
      });
    }
    indexed += rows.length;
  }
}

/** Missing rows are the backlog. Each batch commits independently and is safe to retry. */
export async function indexEmbeddings({ versionId, maxBatches = Infinity }: { versionId?: string; maxBatches?: number } = {}) {
  const port = semanticPort();
  if (!port) return { modelKey: null, indexed: 0 };
  const modelKey = await embeddingModel(port);
  let indexed = 0;
  for (let i = 0; i < maxBatches; i++) {
    const chunks = await q<Chunk>(`SELECT ch.id, ch.heading, ch.content
      FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
      JOIN materials m ON m.id = v.material_id
      WHERE v.status = 'ready' AND m.archived_at IS NULL
        AND (($2::uuid IS NOT NULL AND v.id = $2) OR ($2::uuid IS NULL AND NOT EXISTS (
          SELECT 1 FROM material_versions newer
          WHERE newer.material_id = v.material_id AND newer.status = 'ready' AND newer.version_no > v.version_no)))
        AND NOT EXISTS (SELECT 1 FROM material_chunk_embeddings em WHERE em.chunk_id = ch.id AND em.model_key = $1)
      ORDER BY v.uploaded_at DESC, v.id, ch.ord LIMIT $3`, [modelKey, versionId ?? null, BATCH]);
    if (chunks.length === 0) break;
    const texts = chunks.map(ch => [ch.heading?.slice(0, 240), ch.content].filter(Boolean).join("\n"));
    const encoded = await encode(port, "passage", texts, versionId ? 3000 : 15000);
    if (encoded.modelKey !== modelKey) throw new Error("向量编码服务的模型在索引过程中发生变化");
    const inserted = await q(`INSERT INTO material_chunk_embeddings (chunk_id, model_key, embedding)
      SELECT payload.chunk_id, $1, payload.embedding
      FROM jsonb_to_recordset($2::jsonb) AS payload(chunk_id uuid, embedding real[])
      ON CONFLICT (chunk_id, model_key) DO NOTHING RETURNING chunk_id`,
    [modelKey, JSON.stringify(chunks.map((ch, i) => ({ chunk_id: ch.id, embedding: encoded.vectors[i] })))]);
    indexed += inserted.length;
  }
  return { modelKey, indexed };
}
