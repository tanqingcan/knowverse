import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __kvPool: Pool | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未配置：请复制 .env.example 为 .env 并填写数据库连接");
  return new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
}

/** 开发模式热重载时复用同一个连接池 */
export const pool: Pool = globalThis.__kvPool ?? (globalThis.__kvPool = makePool());
export const db = drizzle(pool, { schema });

export type Tx = PoolClient;

/**
 * 短事务封装：只放数据库读写，不放模型调用等慢操作。
 * 失败自动 ROLLBACK；可选 isolation。
 */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>, opts: { isolation?: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" } = {}): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(opts.isolation ? `BEGIN ISOLATION LEVEL ${opts.isolation}` : "BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    c.release();
  }
}

/** 简便的参数化查询（永远使用 $1,$2… 占位符，不拼接字符串） */
export async function q<T = any>(text: string, params: unknown[] = [], client?: PoolClient): Promise<T[]> {
  const r = await (client ?? pool).query(text, params as any[]);
  return r.rows as T[];
}
export async function q1<T = any>(text: string, params: unknown[] = [], client?: PoolClient): Promise<T | null> {
  const rows = await q<T>(text, params, client);
  return rows[0] ?? null;
}
