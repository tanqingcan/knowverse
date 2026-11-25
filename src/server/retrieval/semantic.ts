import { z } from "zod";
import type { MaterialHit } from "../materials";

export function semanticPort(): number | undefined {
  const port = Number(process.env.RAG_LOCAL_PORT);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

const model = z.object({ modelKey: z.string().min(1).max(100) });
const vector = z.array(z.number().min(-1).max(1)).length(512).refine(values => {
  const norm = values.reduce((total, value) => total + value * value, 0);
  return Math.abs(1 - norm) < 0.02;
}, "编码器必须返回单位向量");

async function embeddingRequest(port: number, pathname: string, timeoutMs: number, body?: object) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    ...(body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`本地向量服务返回 ${response.status}`);
  return response.json();
}

export async function embeddingModel(port: number) {
  return model.parse(await embeddingRequest(port, "/model", 900)).modelKey;
}

export async function encode(port: number, kind: "query" | "passage", texts: string[], timeoutMs: number) {
  const body = await embeddingRequest(port, "/encode", timeoutMs, { kind, texts });
  return model.extend({ vectors: z.array(vector).length(texts.length) }).parse(body);
}

/** Reciprocal rank fusion keeps independently scaled retrieval scores comparable. */
export function fuseRecall(weighted: { rows: MaterialHit[]; weight: number }[], limit: number) {
  const hits = new Map<string, MaterialHit>();
  for (const { rows, weight } of weighted) {
    rows.forEach((hit, i) => {
      const score = (hits.get(hit.chunkId)?.score ?? 0) + weight / (20 + i);
      hits.set(hit.chunkId, { ...hit, score });
    });
  }
  return [...hits.values()].sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId)).slice(0, limit);
}

/** Reserve space for each independently retrieved part of a multi-part question. */
export function mergeRecall(lanes: MaterialHit[][], limit: number) {
  const seen = new Set<string>();
  const hits: MaterialHit[] = [];
  for (let rank = 0; rank < limit; rank++) {
    for (const lane of lanes) {
      const hit = lane[rank];
      if (!hit || seen.has(hit.content.trim())) continue;
      seen.add(hit.content.trim());
      hits.push(hit);
      if (hits.length === limit) return hits;
    }
  }
  return hits;
}
