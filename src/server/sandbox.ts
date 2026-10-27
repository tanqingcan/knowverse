/**
 * SQL 练习受限执行器
 *  - 连接独立的沙箱数据库（SANDBOX_DATABASE_URL），角色只读，无法连接业务库。
 *  - 每次执行：BEGIN READ ONLY → SET LOCAL statement_timeout / search_path → 执行 → ROLLBACK。
 *  - 只允许单条 SELECT / WITH 查询；结果最多 200 行。
 */
import { Pool } from "pg";
import { AppError } from "./errors";

declare global { var __kvSandboxPool: Pool | undefined; }

const DATASETS = new Set(["school_v1"]);

function sandboxPool(): Pool {
  const url = process.env.SANDBOX_DATABASE_URL;
  if (!url) throw new AppError("sandbox_not_configured", "SQL 练习沙箱未配置（SANDBOX_DATABASE_URL）", 503);
  return (globalThis.__kvSandboxPool ??= new Pool({ connectionString: url, max: 4 }));
}

/** 去掉注释与末尾分号后做静态检查；最终安全性由只读角色 + 只读事务 + 独立数据库保证 */
export function checkSql(sql: string): string {
  const stripped = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim().replace(/;\s*$/, "");
  if (!stripped) throw new AppError("sql_empty", "请输入 SQL 语句");
  if (stripped.length > 4000) throw new AppError("sql_too_long", "SQL 过长");
  if (/;/.test(stripped.replace(/'(?:[^']|'')*'/g, "''"))) throw new AppError("sql_multi", "只能提交一条 SQL 语句");
  if (!/^(select|with)\b/i.test(stripped)) throw new AppError("sql_not_select", "练习只允许 SELECT 查询（可以使用 WITH）");
  if (/\b(pg_sleep|pg_read_file|lo_import|dblink|copy)\b/i.test(stripped)) throw new AppError("sql_forbidden", "包含不允许的函数或语句");
  return stripped;
}

export type SqlResult = { columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean; ms: number };

export async function runSandboxSql(datasetKey: string, sql: string): Promise<SqlResult> {
  if (!DATASETS.has(datasetKey)) throw new AppError("sandbox_dataset", `未知数据集 ${datasetKey}`);
  const text = checkSql(sql);
  const c = await sandboxPool().connect();
  const t0 = Date.now();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL statement_timeout = '2000ms'");
    await c.query(`SET LOCAL search_path = ${datasetKey}`); // datasetKey 经过白名单
    const r = await c.query({ text: `SELECT * FROM (${text}) AS kv_q LIMIT 201`, rowMode: "array" });
    const truncated = r.rows.length > 200;
    return { columns: r.fields.map((f) => f.name), rows: r.rows.slice(0, 200), rowCount: Math.min(r.rows.length, 200), truncated, ms: Date.now() - t0 };
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    const msg = e?.code === "57014" ? "查询超时（2 秒）" : `SQL 执行错误：${e?.message ?? e}`;
    throw new AppError("sql_error", msg, 400);
  } finally {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    c.release();
  }
}

/** 以多重集比较两个结果（忽略列名，可选是否比较行序） */
export function sameResult(a: SqlResult, b: SqlResult, ordered: boolean) {
  if (a.columns.length !== b.columns.length) return { equal: false, why: `列数不同：你的结果 ${a.columns.length} 列，期望 ${b.columns.length} 列` };
  const key = (r: unknown[]) => JSON.stringify(r.map((v) => (v === null ? null : typeof v === "number" ? Number(v) : String(v))));
  const ka = a.rows.map(key), kb = b.rows.map(key);
  if (ka.length !== kb.length) return { equal: false, why: `行数不同：你的结果 ${ka.length} 行，期望 ${kb.length} 行` };
  if (ordered) {
    const i = ka.findIndex((k, j) => k !== kb[j]);
    return i === -1 ? { equal: true, why: "结果与期望完全一致（含顺序）" } : { equal: false, why: `第 ${i + 1} 行不同` };
  }
  const sa = [...ka].sort(), sb = [...kb].sort();
  const i = sa.findIndex((k, j) => k !== sb[j]);
  return i === -1 ? { equal: true, why: "结果集合与期望一致" } : { equal: false, why: "行数相同但内容不同" };
}
