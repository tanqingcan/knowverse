/**
 * 行级安全（RLS）集成测试
 *
 * 这些用例统一用 kv_app 角色（NOSUPERUSER / NOBYPASSRLS）连接测试库，
 * 通过事务内 set_config('app.user_id', …) 模拟“当前用户”，验证：
 *   - 没有上下文时看不到任何个人数据；
 *   - 只能看到自己的行；
 *   - 越权写入被 WITH CHECK 拒绝、越权更新影响 0 行；
 *   - 公共课程资料对所有人可见，用户私有资料互相不可见；
 *   - 表所有者连接（迁移/脚本）不受策略限制（对照组）。
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

function readDotEnv(key: string): string | undefined {
  const p = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(p)) return undefined;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
    if (m) return m[1].replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

/** 应用角色连接测试库（把库名换成 knowverse_test） */
function appUrl(): string {
  const raw = process.env.TEST_APP_DATABASE_URL ?? readDotEnv("APP_DATABASE_URL");
  if (!raw) throw new Error("APP_DATABASE_URL 未配置：RLS 用例需要 kv_app 连接");
  return raw.replace(/\/[^/?]+(\?|$)/, "/knowverse_test$1");
}

describe("行级安全（RLS，以 kv_app 连接）", () => {
  let admin: Client;   // 表所有者，用于取基准数据与清理
  let app: Client;     // 应用角色，受 RLS 约束
  let demoId: string;
  let xingyeId: string;
  let demoConversationId: string;
  let privateMaterialId: string;

  beforeAll(async () => {
    admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    app = new Client({ connectionString: appUrl() });
    await app.connect();

    const u = await admin.query("SELECT id, handle FROM users WHERE handle IN ('demo','xingye')");
    demoId = u.rows.find((r: any) => r.handle === "demo").id;
    xingyeId = u.rows.find((r: any) => r.handle === "xingye").id;

    const c = await admin.query("SELECT id FROM conversations WHERE user_id = $1 ORDER BY created_at LIMIT 1", [demoId]);
    demoConversationId = c.rows[0].id;

    const s = await admin.query("SELECT id FROM subjects WHERE owner_user_id IS NULL ORDER BY name LIMIT 1");
    const m = await admin.query(
      `INSERT INTO materials (owner_user_id, subject_id, title, course, kind)
       VALUES ($1, $2, $3, 'RLS 测试课程', 'notes') RETURNING id`,
      [demoId, s.rows[0].id, "RLS 私有资料（测试）"],
    );
    privateMaterialId = m.rows[0].id;
  });

  afterAll(async () => {
    if (admin) {
      await admin.query("DELETE FROM materials WHERE id = $1", [privateMaterialId]).catch(() => {});
      await admin.end();
    }
    if (app) await app.end();
  });

  /** 在事务内以某个用户身份执行，结束后回滚（不污染测试数据） */
  async function asUser<T>(uid: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
    await app.query("BEGIN");
    try {
      if (uid) await app.query("SELECT set_config('app.user_id', $1, true)", [uid]);
      return await fn(app);
    } finally {
      await app.query("ROLLBACK");
    }
  }

  it("应用角色不是超级用户，也不能绕过 RLS", async () => {
    const role = decodeURIComponent(new URL(appUrl()).username);
    const r = await admin.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1", [role]);
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("没有 app.user_id 时，个人数据一行也看不到", async () => {
    const { messages, conversations, goals } = await asUser(null, async (c) => ({
      messages: (await c.query("SELECT count(*)::int n FROM messages")).rows[0].n,
      conversations: (await c.query("SELECT count(*)::int n FROM conversations")).rows[0].n,
      goals: (await c.query("SELECT count(*)::int n FROM learning_goals")).rows[0].n,
    }));
    expect(messages).toBe(0);
    expect(conversations).toBe(0);
    expect(goals).toBe(0);
  });

  it("只能看到自己的消息与会话", async () => {
    const mine = await asUser(demoId, async (c) => ({
      messages: (await c.query("SELECT count(*)::int n FROM messages")).rows[0].n,
      foreign: (await c.query("SELECT count(*)::int n FROM messages WHERE user_id <> $1", [demoId])).rows[0].n,
      conversations: (await c.query("SELECT count(*)::int n FROM conversations")).rows[0].n,
    }));
    const truth = await admin.query("SELECT count(*)::int n FROM messages WHERE user_id = $1", [demoId]);
    expect(mine.messages).toBe(truth.rows[0].n);
    expect(mine.foreign).toBe(0);
    expect(mine.conversations).toBeGreaterThan(0);
  });

  it("换一个用户上下文，看到的是另一个人的数据", async () => {
    const asDemo = await asUser(demoId, async (c) => (await c.query("SELECT count(*)::int n FROM conversations")).rows[0].n);
    const asXingye = await asUser(xingyeId, async (c) => (await c.query("SELECT count(*)::int n FROM conversations")).rows[0].n);
    expect(asXingye).not.toBe(asDemo);
    // 星星的会话里不可能出现 demo 的会话 id
    const leak = await asUser(xingyeId, async (c) =>
      (await c.query("SELECT count(*)::int n FROM conversations WHERE id = $1", [demoConversationId])).rows[0].n);
    expect(leak).toBe(0);
  });

  it("以 A 的身份写 B 的消息，被 WITH CHECK 拒绝（42501）", async () => {
    await expect(
      asUser(demoId, async (c) =>
        c.query(
          `INSERT INTO messages (conversation_id, user_id, seq, role, content, status)
           VALUES ($1, $2, 999999, 'user', '越权写入', 'complete')`,
          [demoConversationId, xingyeId],
        )),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("更新别人的行，影响 0 行", async () => {
    const changed = await asUser(demoId, async (c) =>
      (await c.query("UPDATE messages SET content = '被篡改' WHERE user_id = $1", [xingyeId])).rowCount);
    expect(changed).toBe(0);
  });

  it("公共资料可见，别人的私有资料不可见", async () => {
    const publicCount = await asUser(xingyeId, async (c) =>
      (await c.query("SELECT count(*)::int n FROM materials WHERE owner_user_id IS NULL")).rows[0].n);
    expect(publicCount).toBeGreaterThan(0);

    const seesPrivate = await asUser(xingyeId, async (c) =>
      (await c.query("SELECT count(*)::int n FROM materials WHERE id = $1", [privateMaterialId])).rows[0].n);
    expect(seesPrivate).toBe(0);

    const ownerSees = await asUser(demoId, async (c) =>
      (await c.query("SELECT count(*)::int n FROM materials WHERE id = $1", [privateMaterialId])).rows[0].n);
    expect(ownerSees).toBe(1);
  });

  it("属主连接（迁移/脚本）不受 RLS 影响，作为对照", async () => {
    const r = await admin.query("SELECT count(*)::int n FROM messages");
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
