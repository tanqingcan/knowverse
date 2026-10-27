/**
 * 智能体工具注册表
 *  每个工具声明：输入/输出 Zod 结构、权限级别、超时、是否允许模型直接调用。
 *  - read_own：只读本人数据（以及公共课程资料），SQL 全部带 user_id 条件。
 *  - propose：只返回建议，不写库（概念候选、学习路线、学习卡草稿）。
 *  - write_rules：写入由后端业务规则与数据库事务决定，模型不能直接调用（作答提交、评价）。
 *  模型不能执行任意 SQL，也不能修改学习状态。
 */
import { z, type ZodType } from "zod";
import { q, q1 } from "@/db";
import { AppError } from "../errors";
import { searchHistory, HistoryQuery } from "../history";
import { searchMaterials, locationLabel } from "../materials";
import { matchConcepts, visibleConcepts, prerequisiteClosure } from "../concepts";
import { createPractice, submitAttemptSafe, attemptView, evaluateAnswer, loadTaskVersion } from "../practice";
import { growthExplanation, STAGE_LABEL, type Stage } from "../growth";
import { normName, plainSummary } from "../text";
import type { TraceEntry } from "./trace";
import type { ToolSpec } from "./llm";

export type ToolCtx = { userId: string; timezone: string; trace: TraceEntry[] };
type Permission = "read_own" | "propose" | "write_rules";

export type ToolDef<I, O> = {
  name: string; description: string; permission: Permission; timeoutMs: number; modelCallable: boolean;
  input: ZodType<I, any, any>; output: ZodType<O, any, any>; jsonSchema?: Record<string, unknown>;
  run: (ctx: ToolCtx, input: I) => Promise<O>;
};

const defs: ToolDef<any, any>[] = [];
function tool<I, O>(d: ToolDef<I, O>) { defs.push(d); return d; }

export class ToolError extends AppError {
  constructor(public tool: string, code: string, message: string) { super(code, `[${tool}] ${message}`, 500); }
}

/** 统一执行：输入校验 → 超时控制 → 输出校验 → 记录轨迹 */
export async function runTool<O = any>(name: string, rawInput: unknown, ctx: ToolCtx): Promise<O> {
  const d = defs.find((x) => x.name === name);
  if (!d) throw new ToolError(name, "tool_unknown", "未知工具");
  const t0 = Date.now();
  const parsed = d.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    ctx.trace.push({ tool: name, ok: false, error: "invalid_input", ms: 0 });
    throw new ToolError(name, "tool_invalid_input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    const out = await Promise.race([
      d.run(ctx, parsed.data),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new ToolError(name, "tool_timeout", `超时（${d.timeoutMs}ms）`)), d.timeoutMs); }),
    ]);
    const checked = d.output.safeParse(out);
    if (!checked.success) throw new ToolError(name, "tool_invalid_output", "工具输出不符合约定结构");
    ctx.trace.push({ tool: name, ok: true, ms: Date.now() - t0 });
    return checked.data as O;
  } catch (e: any) {
    ctx.trace.push({ tool: name, ok: false, error: e?.code ?? "error", ms: Date.now() - t0 });
    throw e instanceof AppError ? e : new ToolError(name, "tool_failed", String(e?.message ?? e));
  } finally { clearTimeout(timer); }
}

export function toolCatalog() {
  return defs.map((d) => ({ name: d.name, description: d.description, permission: d.permission, timeoutMs: d.timeoutMs, modelCallable: d.modelCallable }));
}

/** 提供给模型的工具（只读 / 建议类），OpenAI function 格式 */
export function modelToolSpecs(): ToolSpec[] {
  return defs.filter((d) => d.modelCallable && d.jsonSchema).map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.jsonSchema! } }));
}

/* ───────── 工具定义 ───────── */

export const getLearningContext = tool({
  name: "get_learning_context",
  description: "读取用户当前目标、关注的知识点及其成长阶段、近期对话（最多 8 条）与待验证项",
  permission: "read_own", timeoutMs: 3000, modelCallable: false,
  input: z.object({ conversationId: z.string().uuid().nullish(), conceptId: z.string().uuid().nullish() }),
  output: z.object({
    displayName: z.string(),
    goals: z.array(z.object({ title: z.string(), subject: z.string(), concepts: z.array(z.string()) })),
    focus: z.object({ conceptId: z.string(), name: z.string(), subject: z.string(), stage: z.string(), stageLabel: z.string() }).nullable(),
    recent: z.array(z.object({ role: z.string(), content: z.string(), at: z.string() })),
    toVerify: z.array(z.string()),
    subjectIds: z.array(z.string()),
  }),
  run: async (ctx, inp) => {
    const u = await q1(`SELECT display_name FROM users WHERE id = $1`, [ctx.userId]);
    const goals = await q(`SELECT g.title, s.name AS subject, coalesce(array_agg(k.name ORDER BY gc.route_order) FILTER (WHERE k.id IS NOT NULL), '{}') AS concepts
                           FROM learning_goals g JOIN subjects s ON s.id = g.subject_id
                           LEFT JOIN goal_concepts gc ON gc.goal_id = g.id LEFT JOIN concepts k ON k.id = gc.concept_id
                           WHERE g.user_id = $1 AND g.status = 'active' GROUP BY g.id, s.name ORDER BY g.created_at DESC LIMIT 3`, [ctx.userId]);
    let focus = null;
    if (inp.conceptId) {
      const f = await q1(`SELECT k.id, k.name, s.name AS subject, coalesce(ls.stage, 'seed') AS stage FROM concepts k JOIN subjects s ON s.id = k.subject_id
                          LEFT JOIN learning_states ls ON ls.concept_id = k.id AND ls.user_id = $1 WHERE k.id = $2`, [ctx.userId, inp.conceptId]);
      if (f) focus = { conceptId: f.id, name: f.name, subject: f.subject, stage: f.stage, stageLabel: STAGE_LABEL[f.stage as Stage] };
    }
    const recent = inp.conversationId ? (await q(`SELECT role, content, created_at FROM messages WHERE conversation_id = $1 AND user_id = $2 AND status = 'complete'
                                                  ORDER BY seq DESC LIMIT 8`, [inp.conversationId, ctx.userId])).reverse()
      .map((m) => ({ role: m.role, content: m.content.length > 600 ? m.content.slice(0, 600) + "…" : m.content, at: new Date(m.created_at).toISOString() })) : [];
    const toVerify = (await q(`SELECT k.name FROM learning_states ls JOIN concepts k ON k.id = ls.concept_id WHERE ls.user_id = $1 AND ls.stage = 'bud' LIMIT 5`, [ctx.userId])).map((r) => r.name);
    const subjectIds = (await q(`SELECT DISTINCT g.subject_id FROM gardens g JOIN planets p ON p.id = g.planet_id WHERE p.user_id = $1 AND g.archived_at IS NULL`, [ctx.userId])).map((r) => r.subject_id);
    return { displayName: u?.display_name ?? "", goals, focus, recent, toVerify, subjectIds };
  },
});

export const searchConversationsTool = tool({
  name: "search_conversations",
  description: "检索用户本人的历史问答。参数：keyword 关键词，from/to 日期（YYYY-MM-DD，按用户时区），conceptIds 知识点。返回带原消息 ID 的结果，回答时可以引用这些 ID 让用户跳转。",
  permission: "read_own", timeoutMs: 4000, modelCallable: true,
  input: HistoryQuery,
  output: z.object({ total: z.number(), hits: z.array(z.object({ questionId: z.string(), conversationId: z.string(), date: z.string(), question: z.string(), answerSummary: z.string() })) }),
  jsonSchema: {
    type: "object",
    properties: { keyword: { type: "string" }, from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, pageSize: { type: "integer", maximum: 10 } },
  },
  run: async (ctx, inp) => {
    const r = await searchHistory(ctx.userId, ctx.timezone, inp);
    return { total: r.total, hits: r.hits.map((h) => ({ questionId: h.questionId, conversationId: h.conversationId, date: h.localDate, question: h.questionSegs.map((s) => s.text).join(""), answerSummary: h.answerSummary })) };
  },
});

export const searchMaterialsTool = tool({
  name: "search_materials",
  description: "在用户有权限的教学资料中检索片段（课程公共资料 + 本人上传）。返回片段 ID、资料标题、版本号、页码或段落位置与正文。",
  permission: "read_own", timeoutMs: 4000, modelCallable: true,
  input: z.object({ query: z.string().min(1).max(500), subjectIds: z.array(z.string().uuid()).optional(), conceptIds: z.array(z.string().uuid()).optional(), limit: z.number().int().min(1).max(6).optional() }),
  output: z.object({
    terms: z.array(z.string()),
    hits: z.array(z.object({ chunkId: z.string(), versionId: z.string(), versionNo: z.number(), materialTitle: z.string(), location: z.string(), content: z.string(), score: z.number() })),
  }),
  jsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  run: async (ctx, inp) => {
    const r = await searchMaterials(ctx.userId, inp.query, inp);
    return { terms: r.terms, hits: r.hits.map((h) => ({ chunkId: h.chunkId, versionId: h.versionId, versionNo: h.versionNo, materialTitle: h.materialTitle, location: locationLabel(h), content: h.content, score: h.score })) };
  },
});

export const proposeConceptTags = tool({
  name: "propose_concept_tags",
  description: "为一段问答提出知识点标签候选：匹配已有知识点（含学科语境下的同义词），未匹配的名称作为“新概念候选”返回，由用户决定是否建立。不会合并或新建任何知识点。",
  permission: "propose", timeoutMs: 3000, modelCallable: false,
  input: z.object({ text: z.string(), subjectIds: z.array(z.string()).optional(), modelNames: z.array(z.string()).default([]) }),
  output: z.object({
    matches: z.array(z.object({ conceptId: z.string(), name: z.string(), confidence: z.number(), matchedBy: z.string() })),
    newCandidates: z.array(z.object({ name: z.string(), norm: z.string() })),
  }),
  run: async (ctx, inp) => {
    const concepts = await visibleConcepts(ctx.userId, inp.subjectIds);
    const matches = matchConcepts(inp.text, concepts);
    const newCandidates: { name: string; norm: string }[] = [];
    for (const raw of inp.modelNames.slice(0, 6)) {
      const name = raw.trim().slice(0, 40);
      if (!name) continue;
      const m = matchConcepts(name, concepts).find((x) => normName(x.name) === normName(name) || x.matchedBy === normName(name));
      if (m) { if (!matches.some((x) => x.conceptId === m.conceptId)) matches.push({ ...m, confidence: 0.6 }); }
      else if (!newCandidates.some((c) => c.norm === normName(name))) newCandidates.push({ name, norm: normName(name) });
    }
    return { matches: matches.slice(0, 6), newCandidates: newCandidates.slice(0, 4) };
  },
});

export const proposeLearningPath = tool({
  name: "propose_learning_path",
  description: "根据学习目标文本，在课程目录中找出相关知识点并补充其先修知识点，按先修顺序排成探索路线（只是建议，需要用户确认）",
  permission: "propose", timeoutMs: 4000, modelCallable: false,
  input: z.object({ goalText: z.string().min(1).max(300), subjectId: z.string().uuid() }),
  output: z.object({ concepts: z.array(z.object({ conceptId: z.string(), name: z.string(), why: z.string(), order: z.number() })) }),
  run: async (ctx, inp) => {
    const concepts = await visibleConcepts(ctx.userId, [inp.subjectId]);
    const direct = matchConcepts(inp.goalText, concepts);
    const ids = direct.map((d) => d.conceptId);
    const pre = ids.length ? await prerequisiteClosure(ids) : [];
    const all = new Map<string, { why: string; depth: number }>();
    for (const d of direct) all.set(d.conceptId, { why: `目标中直接提到「${d.name}」`, depth: 0 });
    for (const p of pre) if (!all.has(p.prereqId)) all.set(p.prereqId, { why: `是「${concepts.find((c) => c.id === p.conceptId)?.name}」的先修`, depth: p.depth });
    if (!all.size) {
      // 没有直接命中：给出该学科入门的前几个知识点，明确说明
      for (const c of concepts.slice(0, 3)) all.set(c.id, { why: "目标中没有识别到具体知识点，先从学科基础开始（可修改）", depth: 1 });
    }
    const list = [...all.entries()].map(([id, v]) => ({ conceptId: id, name: concepts.find((c) => c.id === id)?.name ?? "", why: v.why, depth: v.depth }))
      .sort((a, b) => b.depth - a.depth).map((c, i) => ({ conceptId: c.conceptId, name: c.name, why: c.why, order: i + 1 }));
    return { concepts: list.slice(0, 8) };
  },
});

export const createPracticeTool = tool({
  name: "create_practice",
  description: "根据真实错题、成长阶段与待复习项选择练习；新用户先给诊断题。返回题目版本 ID 与选题理由。",
  permission: "read_own", timeoutMs: 4000, modelCallable: false,
  input: z.object({ conceptId: z.string().uuid().optional(), subjectId: z.string().uuid().optional(), limit: z.number().int().min(1).max(5).optional() }),
  output: z.object({ purpose: z.string(), explanation: z.string(), picks: z.array(z.object({ taskVersionId: z.string(), title: z.string(), kind: z.string(), isVariant: z.boolean(), suggestedMode: z.string(), reason: z.string(), conceptNames: z.array(z.string()) }).passthrough()) }),
  run: async (ctx, inp) => createPractice(ctx.userId, inp),
});

export const submitAttemptTool = tool({
  name: "submit_attempt",
  description: "提交作答（幂等键保证只结算一次）。由后端接口调用，模型不能直接调用。",
  permission: "write_rules", timeoutMs: 20000, modelCallable: false,
  input: z.object({ attemptId: z.string().uuid(), answer: z.string().min(1).max(8000), submitKey: z.string().min(8).max(80) }),
  output: z.any(),
  run: async (ctx, inp) => submitAttemptSafe(ctx.userId, inp.attemptId, inp.answer, inp.submitKey),
});

export const evaluateAttemptTool = tool({
  name: "evaluate_attempt",
  description: "按题目规格评价答案：确定答案型用规则或受限执行，开放解释型使用公开维度。只返回评价，不写入成长。",
  permission: "write_rules", timeoutMs: 35000, modelCallable: false,
  input: z.object({ attemptId: z.string().uuid(), answer: z.string().min(1) }),
  output: z.any(),
  run: async (ctx, inp) => {
    const v = await attemptView(ctx.userId, inp.attemptId);
    return evaluateAnswer(ctx.userId, await loadTaskVersion(v.task.id, ctx.userId), inp.answer);
  },
});

export const getGrowthExplanation = tool({
  name: "get_growth_explanation",
  description: "解释某个知识点（植物）当前成长阶段的依据、全部证据与下一步",
  permission: "read_own", timeoutMs: 3000, modelCallable: true,
  input: z.object({ conceptId: z.string().uuid() }),
  output: z.object({ stage: z.string(), stageLabel: z.string(), reason: z.string(), next: z.string(), evidence: z.array(z.any()), disclaimer: z.string() }).passthrough(),
  jsonSchema: { type: "object", properties: { conceptId: { type: "string" } }, required: ["conceptId"] },
  run: async (ctx, inp) => growthExplanation(ctx.userId, inp.conceptId),
});

export const draftKnowledgeCard = tool({
  name: "draft_knowledge_card",
  description: "根据某知识点的真实问答、笔记与证据起草学习卡（草稿不自动保存，需要用户确认）",
  permission: "propose", timeoutMs: 4000, modelCallable: false,
  input: z.object({ conceptId: z.string().uuid() }),
  output: z.object({ title: z.string(), body: z.string(), sourceMessageIds: z.array(z.string()), basedOn: z.string() }),
  run: async (ctx, inp) => {
    const k = await q1(`SELECT name FROM concepts WHERE id = $1`, [inp.conceptId]);
    if (!k) throw new AppError("not_found", "知识点不存在", 404);
    const qa = await q(`SELECT qm.id, qm.content AS question, am.content AS answer FROM message_concepts mc
                        JOIN messages qm ON qm.id = mc.message_id AND qm.role = 'user'
                        LEFT JOIN messages am ON am.reply_to_id = qm.id AND am.status = 'complete'
                        WHERE qm.user_id = $1 AND mc.concept_id = $2 AND mc.status = 'confirmed'
                        ORDER BY qm.created_at LIMIT 4`, [ctx.userId, inp.conceptId]);
    const notes = await q(`SELECT title, content FROM notes WHERE user_id = $1 AND concept_id = $2 AND archived_at IS NULL ORDER BY created_at LIMIT 3`, [ctx.userId, inp.conceptId]);
    const g = await growthExplanation(ctx.userId, inp.conceptId);
    const lines = [`## ${k.name}`, ""];
    if (qa.length) { lines.push("**我问过的问题**"); for (const x of qa) lines.push(`- ${plainSummary(x.question, 60)}`); lines.push(""); }
    const firstAns = qa.find((x) => x.answer)?.answer;
    if (firstAns) { lines.push("**要点（来自当时的回答，请改成自己的话）**", plainSummary(firstAns, 220), ""); }
    if (notes.length) { lines.push("**我的笔记**"); for (const n of notes) lines.push(`- ${n.title}：${plainSummary(n.content, 80)}`); lines.push(""); }
    lines.push(`**当前阶段**：${g.stageLabel}（${g.reason}）`);
    return { title: `${k.name} · 学习卡`, body: lines.join("\n"), sourceMessageIds: qa.map((x) => x.id), basedOn: `基于 ${qa.length} 组已确认问答、${notes.length} 条笔记与 ${g.evidence.length} 条证据；内容为草稿，保存前请修改。` };
  },
});

export const findLearningPartners = tool({
  name: "find_learning_partners",
  description: "在班级中寻找互补学习伙伴：只使用双方公开的学习意愿（想获得帮助 / 可以提供帮助）与开放匹配的分享设置",
  permission: "read_own", timeoutMs: 4000, modelCallable: false,
  input: z.object({ classId: z.string().uuid() }),
  output: z.array(z.any()),
  run: async (ctx, inp) => (await import("../classes")).findPartners(ctx.userId, inp.classId),
});

export const createCollaborationSession = tool({
  name: "create_collaboration_session",
  description: "为某知识点创建双人/小组共学任务（名额由数据库约束保证不超员）",
  permission: "write_rules", timeoutMs: 4000, modelCallable: false,
  input: z.object({ classId: z.string().uuid(), conceptId: z.string().uuid(), title: z.string().min(1).max(60), capacity: z.number().int().min(2).max(6) }),
  output: z.any(),
  run: async (ctx, inp) => (await import("../classes")).createGroup(ctx.userId, inp),
});
