/**
 * 大模型客户端（OpenAI 兼容 Chat Completions）。
 *  - Key 只在服务端读取；地址、模型、超时均可配置。
 *  - 真实模式（live）与演示模式（demo）严格分开：live 失败时抛出错误，由调用方显示错误与重试，
 *    绝不静默回退为演示内容。
 */
import { AppError } from "../errors";

export type LlmMode = "live" | "demo";

export function llmConfig() {
  const mode: LlmMode = process.env.LLM_MODE === "live" ? "live" : "demo";
  return {
    mode,
    baseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    apiKey: process.env.LLM_API_KEY ?? "",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 45000),
    toolCalling: process.env.LLM_TOOL_CALLING !== "false",
    provider: (() => { try { return new URL(process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").host; } catch { return "invalid-url"; } })(),
  };
}

/** 对前端公开的模式信息（不含 Key） */
export function publicLlmStatus() {
  const c = llmConfig();
  return {
    mode: c.mode,
    model: c.mode === "live" ? c.model : null,
    provider: c.mode === "live" ? c.provider : null,
    configured: c.mode === "demo" || !!c.apiKey,
    note: c.mode === "demo"
      ? "演示模式：回答来自固定演示逻辑与真实检索结果，未调用大模型；消息、标签、引用与成长均真实写入数据库。"
      : c.apiKey ? "真实模式：调用已配置的大模型接口。" : "真实模式已开启但未配置 LLM_API_KEY，提问会失败并提示配置。",
  };
}

export type ChatMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export type LlmResult = {
  content: string | null; toolCalls: ToolCall[]; promptTokens: number | null; completionTokens: number | null; latencyMs: number;
};

export async function chatCompletion(messages: ChatMsg[], opts: { tools?: ToolSpec[]; json?: boolean; timeoutMs?: number; temperature?: number } = {}): Promise<LlmResult> {
  const c = llmConfig();
  if (c.mode !== "live") throw new AppError("llm_not_live", "当前为演示模式，未调用大模型", 500);
  if (!c.apiKey) throw new AppError("llm_not_configured", "真实模式未配置 LLM_API_KEY：请在服务端 .env 中填写后重启", 503);
  const ctrl = new AbortController();
  const timeout = opts.timeoutMs ?? c.timeoutMs;
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const t0 = Date.now();
  try {
    const body: Record<string, unknown> = { model: c.model, messages, temperature: opts.temperature ?? 0.3 };
    if (opts.tools?.length) { body.tools = opts.tools; body.tool_choice = "auto"; }
    if (opts.json && !opts.tools?.length) body.response_format = { type: "json_object" };
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new AppError(`llm_http_${res.status}`, `模型接口返回错误 ${res.status}：${text.slice(0, 200)}`, 502);
    }
    let data: any;
    try { data = JSON.parse(text); } catch { throw new AppError("llm_bad_response", "模型接口返回的不是 JSON", 502); }
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new AppError("llm_bad_response", "模型接口返回缺少 choices[0].message", 502);
    return {
      content: msg.content ?? null,
      toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
      promptTokens: data?.usage?.prompt_tokens ?? null,
      completionTokens: data?.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - t0,
    };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new AppError("llm_timeout", `模型调用超时（${Math.round(timeout / 1000)} 秒）`, 504);
    if (e instanceof AppError) throw e;
    throw new AppError("llm_network", `无法连接模型接口：${e?.message ?? e}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** 从模型文本中取出 JSON（兼容 ```json 代码块包裹） */
export function extractJson(s: string | null): unknown {
  if (!s) throw new AppError("llm_invalid_output", "模型没有返回内容", 502);
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : s).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new AppError("llm_invalid_output", "模型输出不是 JSON 对象", 502);
  try { return JSON.parse(body.slice(start, end + 1)); }
  catch { throw new AppError("llm_invalid_output", "模型输出的 JSON 无法解析", 502); }
}
