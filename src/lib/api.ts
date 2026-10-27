"use client";
/** 浏览器端 API 调用：统一错误结构；所有数据都来自服务端数据库 */
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public detail?: unknown) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.form ? undefined : opts.body ? { "content-type": "application/json" } : undefined,
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError("network", "网络连接失败，请检查服务是否在运行", 0);
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok || !json?.ok) {
    const err = json?.error;
    throw new ApiError(err?.code ?? `http_${res.status}`, err?.message ?? `请求失败（${res.status}）`, res.status, err?.detail);
  }
  return json.data as T;
}

export function newKey(prefix = "k") {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return prefix + "-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fmtTime(iso: string | Date, withDate = true) {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" }
    : { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" };
  return new Intl.DateTimeFormat("zh-CN", opts).format(d);
}
export function fmtDate(iso: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Taipei" }).format(new Date(iso));
}
