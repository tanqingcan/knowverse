/**
 * 0030 集成验收：C3 倒排索引 + C5 记忆表正式进入迁移，并带 RLS。
 * 这些检查过去依赖 docs/sql/drafts 手工安装，现在应随 db:migrate 自动成立。
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { q, q1 } from "@/db";
import { makeUser } from "./helpers";
import { memoryReady } from "@/server/memory/store";

function readDotEnv(key: string): string | undefined {
  const p = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(p)) return undefined;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
    if (m) return m[1].replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

function appUrl(): string {
  const raw = process.env.TEST_APP_DATABASE_URL ?? readDotEnv("APP_DATABASE_URL");
  if (!raw) throw new Error("APP_DATABASE_URL 未配置：RLS 用例需要 kv_app 连接");
  return raw.replace(/\/[^/?]+(\?|$)/, "/knowverse_test$1");
}

async function newMessage(userId: string, content: string, title = "检索测试会话") {
  const c = await q1<{ id: string }>(`INSERT INTO conversations (user_id, title) VALUES ($1,$2) RETURNING id`, [userId, title]);
  const m = await q1<{ id: string }>(`INSERT INTO messages (user_id, conversation_id, seq, role, content) VALUES ($1,$2,1,'user',$3) RETURNING id`, [userId, c!.id, content]);
  return { conversationId: c!.id, messageId: m!.id };
}

describe("RAG schema 集成（0030）", () => {
  let app: Client;

  beforeAll(async () => {
    app = new Client({ connectionString: appUrl() });
    await app.connect();
  });
  afterAll(async () => {
    await app?.end().catch(() => {});
  });

  /** 以 kv_app 身份、带 app.user_id 上下文执行一次查询（事务内） */
  async function asUser<T = any>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const r = await app.query(sql, params);
      await app.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await app.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  it("三张表存在且已启用 RLS", async () => {
    for (const t of ["message_terms", "memory_controls", "conversation_summaries"]) {
      const r = await q1<{ rls: boolean }>(`SELECT relrowsecurity AS rls FROM pg_class WHERE relname = $1`, [t]);
      expect(r?.rls, t).toBe(true);
    }
    expect(await memoryReady()).toBe(true);
  });

  it("消息插入/修改/删除都会同步 message_terms", async () => {
    const u = await makeUser("ragidx");
    const { conversationId, messageId } = await newMessage(u.id, "条件概率很重要");

    const terms = await q<{ term: string }>(`SELECT term FROM message_terms WHERE message_id = $1`, [messageId]);
    expect(terms.map((x) => x.term)).toEqual(expect.arrayContaining(["条件", "件概", "概率"]));

    await q(`UPDATE messages SET content = '贝叶斯公式' WHERE id = $1`, [messageId]);
    const after = (await q<{ term: string }>(`SELECT term FROM message_terms WHERE message_id = $1`, [messageId])).map((x) => x.term);
    expect(after).not.toContain("条件");
    expect(after).toEqual(expect.arrayContaining(["贝叶", "叶斯"]));

    await q(`UPDATE conversations SET title = '新标题词' WHERE id = $1`, [conversationId]);
    const withTitle = (await q<{ term: string }>(`SELECT term FROM message_terms WHERE message_id = $1`, [messageId])).map((x) => x.term);
    expect(withTitle).toEqual(expect.arrayContaining(["标题", "题词"]));

    await q(`DELETE FROM messages WHERE id = $1`, [messageId]);
    expect(await q(`SELECT 1 FROM message_terms WHERE message_id = $1`, [messageId])).toHaveLength(0);
  });

  it("message_terms 按所属消息做行级隔离（kv_app）", async () => {
    const a = await makeUser("ragrlsa");
    const b = await makeUser("ragrlsb");
    const ma = await newMessage(a.id, "甲独占词汇");
    await newMessage(b.id, "乙独占词汇");

    const own = await asUser(a.id, `SELECT count(*)::int AS n FROM message_terms WHERE message_id = $1`, [ma.messageId]);
    expect(Number(own[0].n)).toBeGreaterThan(0);

    const peek = await asUser(b.id, `SELECT count(*)::int AS n FROM message_terms WHERE message_id = $1`, [ma.messageId]);
    expect(Number(peek[0].n)).toBe(0);

    const allA = await asUser(a.id, `SELECT count(*)::int AS n FROM message_terms`);
    const allB = await asUser(b.id, `SELECT count(*)::int AS n FROM message_terms`);
    expect(Number(allA[0].n)).toBeGreaterThan(0);
    expect(Number(allB[0].n)).toBeGreaterThan(0);

    // 没有用户上下文时看不到任何词项
    const anonymous = await app.query(`SELECT count(*)::int AS n FROM message_terms`);
    expect(Number(anonymous.rows[0].n)).toBe(0);
  });

  it("memory_controls 与 conversation_summaries 按用户隔离（kv_app）", async () => {
    const a = await makeUser("ragmema");
    const b = await makeUser("ragmemb");
    const { conversationId } = await newMessage(a.id, "记忆测试");

    await q(`INSERT INTO memory_controls (user_id, revision) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET revision = 1`, [a.id]);
    await q(`INSERT INTO conversation_summaries (conversation_id, user_id, upto_seq, summary) VALUES ($1,$2,1,'摘要')`, [conversationId, a.id]);

    const controls = await asUser(a.id, `SELECT count(*)::int AS n FROM memory_controls`);
    expect(Number(controls[0].n)).toBe(1);
    const summaries = await asUser(a.id, `SELECT count(*)::int AS n FROM conversation_summaries`);
    expect(Number(summaries[0].n)).toBe(1);

    const otherControls = await asUser(b.id, `SELECT count(*)::int AS n FROM memory_controls`);
    expect(Number(otherControls[0].n)).toBe(0);
    const otherSummaries = await asUser(b.id, `SELECT count(*)::int AS n FROM conversation_summaries`);
    expect(Number(otherSummaries[0].n)).toBe(0);
  });
});
