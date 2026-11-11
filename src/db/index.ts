import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __kvPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __kvAls: AsyncLocalStorage<{ userId: string }> | undefined;
}

/**
 * 请求级的应用用户上下文。
 * authed() 路由进入时调用 runAsUser(user.id)，此后该异步链上的每个查询都会在事务内
 * 执行 set_config('app.user_id', …)，数据库的行级安全策略据此过滤。
 */
const als: AsyncLocalStorage<{ userId: string }> =
  globalThis.__kvAls ?? (globalThis.__kvAls = new AsyncLocalStorage<{ userId: string }>());

export function runAsUser<T>(userId: string, fn: () => T): T {
  return als.run({ userId }, fn);
}
export function currentUserId(): string | undefined {
  return als.getStore()?.userId;
}

function makePool() {
  // 运行时用 kv_app（受 RLS 约束）；迁移/种子/测试脚本设置 KV_CONNECTION=system 后走 DATABASE_URL（所有者，绕过 RLS）
  const system = process.env.KV_CONNECTION === "system";
  const url = system ? process.env.DATABASE_URL : process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未配置：请复制 .env.example 为 .env 并填写数据库连接");
  return new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
}

/** 开发模式热重载时复用同一个连接池 */
export const pool: Pool = globalThis.__kvPool ?? (globalThis.__kvPool = makePool());
export const db = drizzle(pool, { schema });

export type Tx = PoolClient;

/** 在事务开始时注入当前用户；未设置上下文时保持“系统连接”行为 */
async function applyUserContext(c: PoolClient) {
  const uid = currentUserId();
  if (uid) await c.query("SELECT set_config('app.user_id', $1, true)", [uid]);
}

/**
 * 短事务封装：只放数据库读写，不放模型调用等慢操作。
 * 失败自动 ROLLBACK；可选 isolation。
 */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>, opts: { isolation?: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" } = {}): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(opts.isolation ? `BEGIN ISOLATION LEVEL ${opts.isolation}` : "BEGIN");
    await applyUserContext(c);
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

/**
 * 简便的参数化查询（永远使用 $1,$2… 占位符，不拼接字符串）。
 * 有用户上下文时，单条查询也放进一个短事务里注入 app.user_id，保证 RLS 生效。
 */
export async function q<T = any>(text: string, params: unknown[] = [], client?: PoolClient): Promise<T[]> {
  if (client) {
    const r = await client.query(text, params as any[]);
    return r.rows as T[];
  }
  const uid = currentUserId();
  if (!uid) {
    const r = await pool.query(text, params as any[]);
    return r.rows as T[];
  }
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await applyUserContext(c);
    const r = await c.query(text, params as any[]);
    await c.query("COMMIT");
    return r.rows as T[];
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    c.release();
  }
}
export async function q1<T = any>(text: string, params: unknown[] = [], client?: PoolClient): Promise<T | null> {
  const rows = await q<T>(text, params, client);
  return rows[0] ?? null;
}
