import { q1 } from "@/db";

export type TraceEntry = Record<string, unknown>;

/** 记录一次模型/智能体调用的元数据（不保存 Key、不保存完整提示词） */
export async function recordModelCall(m: {
  userId: string; purpose: string; mode: "live" | "demo"; status: "running" | "ok" | "error" | "timeout" | "invalid_output";
  latencyMs?: number | null; promptTokens?: number | null; completionTokens?: number | null;
  errorCode?: string | null; errorMessage?: string | null; trace?: TraceEntry[];
}): Promise<string> {
  const cfg = { provider: process.env.LLM_MODE === "live" ? safeHost(process.env.LLM_BASE_URL) : null, model: process.env.LLM_MODE === "live" ? process.env.LLM_MODEL ?? null : null };
  const r = await q1<{ id: string }>(
    `INSERT INTO model_calls (user_id, purpose, mode, provider, model, status, finished_at, latency_ms, prompt_tokens, completion_tokens, error_code, error_message, tool_trace)
     VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6 = 'running' THEN NULL ELSE now() END, $7,$8,$9,$10,$11,$12) RETURNING id`,
    [m.userId, m.purpose, m.mode, m.mode === "live" ? cfg.provider : "demo", m.mode === "live" ? cfg.model : "fixed-demo", m.status,
      m.latencyMs ?? null, m.promptTokens ?? null, m.completionTokens ?? null, m.errorCode ?? null, m.errorMessage?.slice(0, 500) ?? null,
      m.trace ? JSON.stringify(m.trace) : null],
  );
  return r!.id;
}
function safeHost(u?: string) { try { return u ? new URL(u).host : null; } catch { return null; } }
