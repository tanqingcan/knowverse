/**
 * 主智能体（单一主循环 + 工具），不做多智能体编排。
 *
 * 识别请求 → 读取当前目标与会话 → 检索有权限的资料与历史 → 回答或生成练习
 * → （作答、校验与证据由练习接口 + 业务事务完成）→ 返回下一步与成长事件
 */
import { llmConfig, chatCompletion, extractJson, type ChatMsg } from "./llm";
import { AgentAnswer, SYSTEM_PROMPT, renderContext, type RefMaterial, type RefHistory } from "./prompts";
import { demoAnswer } from "./demo";
import { runTool, modelToolSpecs, type ToolCtx } from "./tools";
import { AppError } from "../errors";

export type Intent = "ask" | "history" | "practice";

export function classifyIntent(text: string): Intent {
  if (/(出|来|给我|生成).{0,4}(题|练习)|考考我|测一测|做(几|一)道/.test(text)) return "practice";
  if (/(之前|以前|上次|曾经|过去).{0,8}(问|聊|讨论|学)过|我问过|历史(问答|记录)/.test(text)) return "history";
  return "ask";
}

/** 从历史类问题中提取检索关键词：去掉“我之前问过”等引导语 */
function historyKeyword(text: string) {
  const t = text.replace(/[我你]?(之前|以前|上次|曾经|过去)?(都)?(问|聊|讨论|学)过(的)?|关于|什么|哪些|有关|的问题|问题|吗|呢|？|\?|。/g, " ").trim();
  const ascii = t.match(/[A-Za-z][A-Za-z ]+[A-Za-z]/);
  if (ascii) return ascii[0].trim();
  const zh = t.match(/[一-龥]{2,8}/);
  return zh ? zh[0] : undefined;
}

export type TurnResult = {
  mode: "live" | "demo"; intent: Intent;
  answer: AgentAnswer;
  materials: RefMaterial[];
  history: RefHistory[];
  tags: { matches: { conceptId: string; name: string; confidence: number; matchedBy: string }[]; newCandidates: { name: string; norm: string }[] };
  usage: { promptTokens: number | null; completionTokens: number | null; latencyMs: number };
  trace: ToolCtx["trace"];
};

export async function runChatTurn(o: { userId: string; timezone: string; conversationId: string; text: string; focusConceptId?: string | null; subjectId?: string | null }): Promise<TurnResult> {
  const cfg = llmConfig();
  const ctx: ToolCtx = { userId: o.userId, timezone: o.timezone, trace: [] };
  const t0 = Date.now();
  const intent = classifyIntent(o.text);
  ctx.trace.push({ step: "classify", intent });

  const learning = await runTool("get_learning_context", { conversationId: o.conversationId, conceptId: o.focusConceptId ?? null }, ctx);
  const subjectIds = o.subjectId ? [o.subjectId] : learning.subjectIds;

  const matQuery = o.text + (learning.focus ? ` ${learning.focus.name}` : "");
  const mats = await runTool("search_materials", { query: matQuery, subjectIds: subjectIds.length ? subjectIds : undefined, conceptIds: o.focusConceptId ? [o.focusConceptId] : undefined, limit: 4 }, ctx);
  const materials: RefMaterial[] = mats.hits.map((h: any, i: number) => ({ ref: `资料${i + 1}`, chunkId: h.chunkId, materialTitle: h.materialTitle, versionNo: h.versionNo, location: h.location, content: h.content }));

  let history: RefHistory[] = [];
  if (intent === "history") {
    const kw = historyKeyword(o.text);
    const h = await runTool("search_conversations", { keyword: kw, pageSize: 8 }, ctx);
    history = h.hits.map((x: any, i: number) => ({ ref: `历史${i + 1}`, conversationId: x.conversationId, questionId: x.questionId, date: x.date, question: x.question, answerSummary: x.answerSummary }));
  }

  let practice: any = null;
  if (intent === "practice") practice = await runTool("create_practice", { conceptId: o.focusConceptId ?? undefined, subjectId: o.subjectId ?? undefined }, ctx);

  let answer: AgentAnswer;
  let usage = { promptTokens: null as number | null, completionTokens: null as number | null, latencyMs: 0 };

  if (cfg.mode === "demo") {
    answer = demoAnswer({ text: o.text, intent, materials, history, practice });
    ctx.trace.push({ step: "answer", mode: "demo" });
  } else {
    const messages: ChatMsg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderContext({ learning, materials, history, intent: intent === "practice" ? `练习请求。系统已选题：${JSON.stringify(practice)}。请简短说明选题理由，题目链接用 kv://practice/<taskVersionId>?mode=<mode> 格式。` : intent === "history" ? "历史回顾请求。引用历史时请给出 kv://message/<conversationId>/<questionId> 链接。" : "答疑请求" }) },
      ...learning.recent.slice(-6).map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }) as ChatMsg),
      { role: "user", content: o.text },
    ];
    const tools = cfg.toolCalling ? modelToolSpecs() : [];
    let final: string | null = null;
    for (let round = 0; round < 3; round++) {
      const r = await chatCompletion(messages, { tools: round < 2 ? tools : [], json: round === 2 || !tools.length });
      usage = { promptTokens: (usage.promptTokens ?? 0) + (r.promptTokens ?? 0), completionTokens: (usage.completionTokens ?? 0) + (r.completionTokens ?? 0), latencyMs: usage.latencyMs + r.latencyMs };
      if (!r.toolCalls.length) { final = r.content; break; }
      messages.push({ role: "assistant", content: r.content, tool_calls: r.toolCalls });
      for (const call of r.toolCalls) {
        let result: unknown;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          if (call.function.name === "search_materials") args.subjectIds = subjectIds.length ? subjectIds : undefined;
          result = await runTool(call.function.name, args, ctx);
          if (call.function.name === "search_materials") {
            // 模型追加检索到的资料，编号接在后面，引用仍然只能指向真实片段
            for (const h of (result as any).hits) if (!materials.some((m) => m.chunkId === h.chunkId)) {
              materials.push({ ref: `资料${materials.length + 1}`, chunkId: h.chunkId, materialTitle: h.materialTitle, versionNo: h.versionNo, location: h.location, content: h.content });
            }
            result = { hits: materials.map((m) => ({ ref: m.ref, title: m.materialTitle, location: m.location, content: m.content })) };
          }
        } catch (e: any) {
          result = { error: e?.code ?? "tool_error", message: e?.message ?? String(e) };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
      }
    }
    let parsed;
    try {
      parsed = AgentAnswer.safeParse(extractJson(final));
    } catch (e) { throw e; }
    if (!parsed.success) throw new AppError("llm_invalid_output", "模型输出不符合约定结构（已拒绝保存）", 502, parsed.error.issues.slice(0, 3));
    answer = parsed.data;
    ctx.trace.push({ step: "answer", mode: "live" });
  }

  // 引用校验：只保留指向真实片段的引用；资料依据不足时降级
  const valid = new Set(materials.map((m) => m.ref));
  const cited = answer.citations.filter((c) => valid.has(c.ref.replace(/[\[\]]/g, "")));
  answer.citations = cited.map((c) => ({ ...c, ref: c.ref.replace(/[\[\]]/g, "") }));
  answer.answer = answer.answer.replace(/\[(资料\d+)\]/g, (m, ref) => (valid.has(ref) ? m : ""));
  if ((answer.basis === "materials" || answer.basis === "mixed") && !answer.citations.length) answer.basis = "general";

  // 标签候选：以“问题”本身为主；回答中只采用模型（或演示逻辑）明确列出的知识点，避免回答里顺带提到的概念都被打上标签
  const tags = await runTool("propose_concept_tags", { text: o.text, subjectIds: subjectIds.length ? subjectIds : undefined, modelNames: answer.concepts }, ctx);
  usage.latencyMs = usage.latencyMs || Date.now() - t0;
  return { mode: cfg.mode, intent, answer, materials, history, tags, usage, trace: ctx.trace };
}
