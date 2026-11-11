/**
 * SQL 注入防护测试（防御方视角）
 *
 * 我们不尝试攻击任何外部系统；这里用一组经典 payload 打自己的接口与查询函数，证明：
 *   1. 关键词里的 % / _ 被转义，不会变成通配符；
 *   2. `' OR 1=1 --`、`'; DROP TABLE ...` 这类串只会当普通文本，不会执行；
 *   3. 表还在、行数不变；
 *   4. 用户输入在写库时按字面量保存（不是拼进 SQL）。
 */
import { describe, expect, it } from "vitest";
import { q, q1 } from "@/db";
import { registerUser } from "@/server/auth";
import { HistoryQuery, searchHistory } from "@/server/history";
import { makeUser } from "./helpers";

const TZ = "Asia/Shanghai";
const page = { page: 1, pageSize: 10 } as const;

async function seedOneMessage(userId: string, content: string): Promise<string> {
  const conv = await q1<{ id: string }>(
    `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`, [userId, "注入测试会话"]);
  await q(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status)
           VALUES ($1, $2, 1, 'user', $3, 'complete')`, [conv!.id, userId, content]);
  return conv!.id;
}

describe("SQL 注入防护", () => {
  it("LIKE 通配符被转义：搜 % 和 _ 不会匹配全部", async () => {
    const u = await makeUser("inj");
    await seedOneMessage(u.id, "hello world，这是一条普通消息");
    expect((await searchHistory(u.id, TZ, { keyword: "%", ...page })).total).toBe(0);
    expect((await searchHistory(u.id, TZ, { keyword: "_", ...page })).total).toBe(0);
    expect((await searchHistory(u.id, TZ, { keyword: "hello", ...page })).total).toBe(1);
  });

  it("' OR 1=1 -- 不返回额外数据", async () => {
    const u = await makeUser("in2");
    await seedOneMessage(u.id, "第二条普通消息");
    const r = await searchHistory(u.id, TZ, { keyword: "' OR 1=1 --", ...page });
    expect(r.total).toBe(0);
    expect(r.hits).toHaveLength(0);
  });

  it("'; DROP TABLE / TRUNCATE 不会执行，表与行数不变", async () => {
    const u = await makeUser("in3");
    const before = Number((await q1<{ n: number }>(`SELECT count(*)::int n FROM messages`))!.n);
    for (const payload of ["'; DROP TABLE messages; --", "'; TRUNCATE messages CASCADE; --", "1; DELETE FROM messages; --"]) {
      await expect(searchHistory(u.id, TZ, { keyword: payload, ...page })).resolves.toBeTruthy();
    }
    const after = Number((await q1<{ n: number }>("SELECT count(*)::int n FROM messages"))!.n);
    const table = await q1<{ t: string | null }>(`SELECT to_regclass('public.messages')::text AS t`);
    expect(after).toBe(before);
    expect(table!.t).toBe("messages");
  });

  it("用户输入按字面量保存（不是拼接进 SQL）", async () => {
    const u = await makeUser("in4");
    const payload = `x'); UPDATE users SET display_name='hacked'; --`;
    const note = await q1<{ id: string }>(
      `INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3) RETURNING id`,
      [u.id, "注入笔记", payload]);
    const back = await q1<{ content: string }>(`SELECT content FROM notes WHERE id = $1`, [note!.id]);
    expect(back!.content).toBe(payload);
    const me = await q1<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [u.id]);
    expect(me!.display_name).not.toBe("hacked");
  });

  it("注册名校验拒绝注入串；超长关键词被 zod 拒绝", async () => {
    await expect(registerUser("' OR 1=1 --", "x", "secret123")).rejects.toMatchObject({ code: "bad_handle" });
    const u = await makeUser("in5");
    expect(HistoryQuery.safeParse({ keyword: "a".repeat(81) }).success).toBe(false);
  });

  it("参数化查询把注入串当普通值（不会因为引号报语法错误）", async () => {
    const payload = "' OR '1'='1";
    const r = await q1<{ v: string }>(`SELECT $1::text AS v`, [payload]);
    expect(r!.v).toBe(payload);
  });
});
