import "./env";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { pool, q, q1, runAsUser } from "../src/db";
import { getUserById } from "../src/server/auth";
import { sendMessage } from "../src/server/chat";
import { llmConfig } from "../src/server/agent/llm";
import { locationLabel, searchMaterials, uploadMaterial, type MaterialHit } from "../src/server/materials";
import { backfillChunkConcepts, indexEmbeddings } from "../src/server/retrieval/material-index";
import { cases as baseCases, scaleCase, sources, type Evidence } from "./textbook-cases";

const normalize = (s: string) => s.replace(/\s+/g, "");
const limit = 4;
const privateTitle = "评测用他人私有笔记";
const privateMarker = "铜铃校验码为 KV-PRIVATE-417";
const match = (hit: MaterialHit, [key, location, quote]: Evidence) => {
  const source = sources[key];
  return hit.materialTitle === source.title && hit.versionNo === source.version
    && (source.location === "page" ? hit.pageNo : hit.paragraphNo) === location
    && normalize(hit.content).includes(normalize(quote));
};

async function addUser() {
  const row = await q1<{ id: string }>(
    "INSERT INTO users (handle, display_name, password_hash) VALUES ($1, '教材评测', 'disabled') RETURNING id",
    ["txt_" + randomUUID().slice(0, 16)],
  );
  const user = await getUserById(row!.id);
  if (!user) throw new Error("未能创建教材评测账号");
  return user;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/knowverse_test") {
    throw new Error("教材评测只写入已迁移和播种的本机 knowverse_test");
  }
  const scale = process.argv.includes("--scale");
  const cases = scale ? [...baseCases, scaleCase] : baseCases;
  const [output = "test-results/textbook-eval.json", mode] = process.argv.slice(2).filter(arg => arg !== "--scale");
  if (mode && mode !== "--live" && mode !== "--demo") throw new Error("参数格式：输出 JSON 路径 [--demo 或 --live] [--scale]");
  const live = mode === "--live";
  const config = llmConfig();
  if (live && (config.mode !== "live" || !config.apiKey)) throw new Error("--live 需要已配置的 LLM_MODE=live");
  if (mode === "--demo" && config.mode !== "demo") throw new Error("--demo 需要 LLM_MODE=demo");

  const subjects = await q<{ id: string; code: string }>("SELECT id, code FROM subjects WHERE code IN ('dbms','prob') AND owner_user_id IS NULL");
  const subjectId = (code: string) => {
    const id = subjects.find(s => s.code === code)?.id;
    if (!id) throw new Error(`缺少种子课程 ${code}`);
    return id;
  };
  const user = await addUser();
  const other = await addUser();
  const pptx = await uploadMaterial({
    userId: user.id, subjectId: subjectId("dbms"), title: sources.notes.title, course: "数据库系统概论",
    kind: "slides", fileName: "C2-含备注的连接查询课件.pptx", mimeType: null,
    buf: await readFile("seed/materials/C2-含备注的连接查询课件.pptx"),
  });
  const privateDoc = await uploadMaterial({
    userId: other.id, subjectId: subjectId("dbms"), title: privateTitle, course: "数据库系统概论",
    kind: "notes", fileName: "private-eval.txt", mimeType: null,
    buf: Buffer.from(`春季阅卷。${privateMarker}。`),
  });
  let scopeChecks: { filler: number; oldId: string; otherId: string } | null = null;
  if (scale) {
    const common = { subjectId: subjectId("dbms"), course: "数据库系统概论", kind: "notes", fileName: "chapter.md", mimeType: null };
    const add = (userId: string, title: string, text: string, materialId?: string) =>
      uploadMaterial({ ...common, userId, title, materialId, buf: Buffer.from(text) });
    const first = await add(user.id, sources.privateKeys.title, "# 青瓦旧稿\n\n青瓦案例的候选键旧稿暂定为 L。");
    const revised = await add(user.id, sources.privateKeys.title, "# 青瓦新版\n\n青瓦案例的唯一候选键是 A。", first.materialId);
    if (revised.versionNo !== 2) throw new Error("私有资料换版失败");
    const otherCopy = await add(other.id, sources.privateKeys.title, "# 另一账号笔记\n\n青瓦案例的唯一候选键是 Z。");
    await add(user.id, sources.privatePages.title, "# 北桥分区\n\n北桥案例的分区裁剪只访问十一月分区。");
    const filler = await add(user.id, "学生自编的大批量复习材料", Array.from({ length: 224 }, (_, i) =>
      `## 第 ${i + 1} 节\n\n第 ${i + 1} 行反映样例数据导入与字段格式检查。每周复习以教师发放的作业为准。`).join("\n\n"));
    if (filler.chunkCount < 220) throw new Error("规模语料没有按预期拆段");
    scopeChecks = { filler: filler.chunkCount, oldId: first.versionId, otherId: otherCopy.materialId };
  }
  await backfillChunkConcepts();
  const vectors = await indexEmbeddings();
  const persistedVectors = vectors.modelKey
    ? (await q1<{ count: number }>("SELECT count(*)::int AS count FROM material_chunk_embeddings WHERE model_key=$1", [vectors.modelKey]))?.count ?? 0
    : 0;
  const corpus = await q<MaterialHit & { subjectId: string }>(`SELECT m.id AS "materialId", m.subject_id AS "subjectId", m.title AS "materialTitle", v.version_no AS "versionNo",
    v.id AS "versionId", v.file_type AS "fileType", ch.id AS "chunkId", ch.page_no AS "pageNo",
    ch.paragraph_no AS "paragraphNo", ch.heading, ch.ord, ch.content, 0 AS score
    FROM materials m JOIN material_versions v ON v.material_id = m.id
    JOIN material_chunks ch ON ch.version_id = v.id
    WHERE (m.owner_user_id IS NULL OR m.owner_user_id = $1 OR m.owner_user_id = $2)
      AND m.archived_at IS NULL`, [user.id, other.id]);
  for (const item of cases) {
    for (const group of item.evidence) {
      for (const anchor of group) {
        if (!corpus.some(h => match(h, anchor))) throw new Error(`金标准原文缺失：${item.id} ${anchor.join(" / ")}`);
      }
    }
  }
  const scan = await q1<{ status: string; n: number }>(`SELECT v.status, count(ch.id)::int AS n
    FROM materials m JOIN material_versions v ON v.material_id = m.id
    LEFT JOIN material_chunks ch ON ch.version_id = v.id
    WHERE m.title = '扫描版习题（示例，需 OCR）' AND m.owner_user_id IS NULL GROUP BY v.id`);
  if (scan?.status !== "needs_ocr" || scan.n !== 0 || pptx.status !== "ready" || privateDoc.status !== "ready") {
    throw new Error("课件、私有资料或扫描件准备失败");
  }

  const search = (userId: string, question: string, subject: string) => runAsUser(userId,
    () => searchMaterials(userId, question, { subjectIds: [subjectId(subject)], limit }));
  const control = await search(other.id, "“铜铃校验码”", "dbms");
  if (!control.hits.some(h => h.materialId === privateDoc.materialId)) throw new Error("私有资料对照账号未召回原文");
  async function evaluate(item: typeof cases[number]) {
    const start = performance.now();
    const result = await search(user.id, item.question, item.subject);
    const { terms } = result;
    const hits = result.hits.map(hit => {
      const chunk = corpus.find(row => row.chunkId === hit.chunkId);
      if (!chunk) throw new Error(`语料外的候选片段：${item.id}`);
      return { ...chunk, score: hit.score };
    });
    const retrievalMs = +(performance.now() - start).toFixed(2);
    const ranks = item.evidence.map(group => hits.findIndex(h => group.some(e => match(h, e))) + 1);
    const stale = hits.some(h => h.materialTitle === sources.joins.title && h.versionNo !== sources.joins.version);
    const leaked = hits.some(h => h.materialId === privateDoc.materialId || h.content.includes(privateMarker));
    if (leaked || stale || (scopeChecks && hits.some(h => h.versionId === scopeChecks.oldId || h.materialId === scopeChecks.otherId))) {
      throw new Error(`召回越过资料权限或选错版本：${item.id}`);
    }
    console.log(item.id, item.evidence.length ? ranks.join(",") : `${hits.length} 个候选`);
    return {
      ...item, terms, retrievalMs, ranks, semantic: result.semantic,
      candidates: hits.map(h => ({ title: h.materialTitle, version: h.versionNo, location: locationLabel(h), heading: h.heading, score: h.score, passage: h.content })),
    };
  }
  const records: Awaited<ReturnType<typeof evaluate>>[] = [];
  for (const item of cases) records.push(await evaluate(item));
  const positives = records.filter(r => r.ranks.length);
  const negatives = records.filter(r => !r.ranks.length);
  const timings = records.map(r => r.retrievalMs).sort((a, b) => a - b);
  const summary = {
    questions: records.length, positives: positives.length, negatives: negatives.length,
    hitAt1: positives.filter(r => r.ranks.includes(1)).length,
    hitAt4: positives.filter(r => r.ranks.some(Boolean)).length,
    allEvidenceAt4: positives.filter(r => r.ranks.every(Boolean)).length,
    negativeEmpty: negatives.filter(r => !r.candidates.length).length,
    p50Ms: timings[Math.ceil(timings.length * 0.5) - 1],
    p95Ms: timings[Math.ceil(timings.length * 0.95) - 1],
  };
  await mkdir(dirname(output), { recursive: true });
  const answers: unknown[] = [];
  const save = () => writeFile(output, JSON.stringify({
    generation: live ? config.model : mode === "--demo" ? "demo-extractive" : null, summary, records, answers,
    checks: { scanStatus: scan.status, scanChunks: scan.n, otherOwnerCanRetrieve: true, scaleFragments: scopeChecks?.filler ?? 0,
      embeddingModel: vectors.modelKey, persistedVectors },
  }, null, 2) + "\n");
  await save();
  if (mode) {
    let position = 0;
    async function worker() {
      while (position < cases.length) {
        const item = cases[position++];
        const start = performance.now();
        const result = await runAsUser(user.id, () => sendMessage(user, {
          text: `${item.question}\n请仅依据本课程教材回答。`,
          subjectId: subjectId(item.subject),
        }));
        const answer = result.messages.at(-1)!;
        const citedChunks: MaterialHit[] = [];
        const cites = answer.citations.map((c: {chunkId:string; materialTitle:string; versionNo:number; fileType:string; pageNo:number|null; paragraphNo:number|null; quote:string}) => {
          const chunk = corpus.find(ch => ch.chunkId === c.chunkId);
          if (!chunk || chunk.materialId === privateDoc.materialId || chunk.subjectId !== subjectId(item.subject)
              || (scopeChecks && (chunk.versionId === scopeChecks.oldId || chunk.materialId === scopeChecks.otherId))
              || (chunk.materialTitle === sources.joins.title && chunk.versionNo !== sources.joins.version)) {
            throw new Error(`出现跨权限、跨学科或旧版本引用：${item.id}`);
          }
          citedChunks.push(chunk);
          return { title: c.materialTitle, version: c.versionNo, location: locationLabel(c), quote: c.quote,
            fromOriginal: !!c.quote && normalize(chunk.content).includes(normalize(c.quote)),
            passage: chunk.content };
        });
        answers.push({ id: item.id, status: answer.status, error: answer.errorMessage, basis: answer.basis,
          citedEvidenceGroups: item.evidence.map(group => citedChunks.some(ch => group.some(e => match(ch, e)))),
          answer: answer.content, citations: cites, ms: Math.round(performance.now() - start) });
        console.log(`${mode} ${item.id} ${answer.status} ${answer.basis} ${cites.length} 引用`);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    await save();
  }
  console.log(JSON.stringify(summary));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
