/** 历史问答检索：关键词（含中文）、时间（时区与边界）、知识点、组合条件、分页、定位原消息、数据隔离 */
import { describe, it, expect, beforeAll } from "vitest";
import { q, q1, makeUser, concept } from "./helpers";
import { searchHistory } from "@/server/history";
import { conversationWindow, sendMessage } from "@/server/chat";
import type { CurrentUser } from "@/server/auth";

let A: CurrentUser, B: CurrentUser;
let leftJoin: string, innerJoin: string;

/** 直接写入一组带指定时间的问答（用于边界测试） */
async function qa(u: CurrentUser, title: string, question: string, answer: string, at: string, tagConcept?: string) {
  const c = await q1(`INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES ($1,$2,$3,$3) RETURNING id`, [u.id, title, at]);
  const seq = 0;
  const qm = await q1(`INSERT INTO messages (conversation_id, user_id, seq, role, content, created_at) VALUES ($1,$2,$3,'user',$4,$5) RETURNING id`, [c.id, u.id, seq + 1, question, at]);
  await q(`INSERT INTO messages (conversation_id, user_id, seq, role, content, reply_to_id, mode, created_at) VALUES ($1,$2,$3,'assistant',$4,$5,'demo',$6)`, [c.id, u.id, seq + 2, answer, qm.id, at]);
  if (tagConcept) await q(`INSERT INTO message_concepts (message_id, concept_id, source, status) VALUES ($1,$2,'user','confirmed')`, [qm.id, tagConcept]);
  return { conversationId: c.id as string, questionId: qm.id as string };
}

beforeAll(async () => {
  A = await makeUser("hista");
  B = await makeUser("histb");
  leftJoin = await concept("左外连接");
  innerJoin = await concept("内连接");
  // 台北时间 3 月 10 日 23:30 与 3 月 11 日 00:10（跨越午夜）
  await qa(A, "连接查询复习", "LEFT JOIN 为什么会丢行？", "因为右表条件写在了 WHERE 中。", "2026-03-10T23:30:00+08:00", leftJoin);
  await qa(A, "第二天的问题", "内连接和左外连接的区别？", "内连接只保留匹配的行。", "2026-03-11T00:10:00+08:00", innerJoin);
  await qa(A, "概率", "条件概率的分母是什么？", "分母是 P(B)。", "2026-03-12T09:00:00+08:00");
  for (let i = 0; i < 13; i++) await qa(A, `分页测试 ${i}`, `分页关键词 星屿 第 ${i} 条`, `回答 ${i}`, `2026-04-0${1 + (i % 9)}T10:${String(10 + i).padStart(2, "0")}:00+08:00`);
  // 另一位用户含相同关键词的记录
  await qa(B, "B 的连接问题", "LEFT JOIN 是什么？", "B 的回答", "2026-03-10T20:00:00+08:00", leftJoin);
});

describe("历史问答检索", () => {
  it("英文关键词：命中标题、问题或回答，大小写不敏感，并给出高亮片段", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { keyword: "left join", page: 1, pageSize: 10 });
    expect(r.total).toBe(1);
    const h = r.hits[0];
    expect(h.questionSegs.some((s) => s.hit && s.text.toLowerCase() === "left join")).toBe(true);
    expect(h.matchedIn).toContain("question");
  });

  it("中文关键词（两个字，低于 trigram 长度）仍然真实有效", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { keyword: "分母", page: 1, pageSize: 10 });
    expect(r.total).toBe(1);
    expect(r.hits[0].questionSegs.map((s) => s.text).join("")).toContain("条件概率");
    const r2 = await searchHistory(A.id, "Asia/Taipei", { keyword: "左外连接", page: 1, pageSize: 10 });
    expect(r2.total).toBe(1);
  });

  it("关键词中的 % 与 _ 被当作普通字符，不会变成通配符", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { keyword: "%", page: 1, pageSize: 10 });
    expect(r.total).toBe(0);
    const r2 = await searchHistory(A.id, "Asia/Taipei", { keyword: "_", page: 1, pageSize: 10 });
    expect(r2.total).toBe(0);
  });

  it("日期按用户时区的自然日筛选，左闭右开：3 月 10 日不包含次日 00:10 的问题", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { from: "2026-03-10", to: "2026-03-10", page: 1, pageSize: 10 });
    expect(r.total).toBe(1);
    expect(r.hits[0].localDate).toBe("2026-03-10 23:30");
    // 换成 UTC：台北 3/10 23:30 是 UTC 15:30，3/11 00:10 是 UTC 3/10 16:10，二者都属于 UTC 的 3 月 10 日
    const u = await searchHistory(A.id, "UTC", { from: "2026-03-10", to: "2026-03-10", page: 1, pageSize: 10 });
    expect(u.total).toBe(2);
  });

  it("知识点筛选（经由 message_concepts 关联表）", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { conceptIds: [innerJoin], page: 1, pageSize: 10 });
    expect(r.total).toBe(1);
    expect(r.hits[0].concepts.map((c) => c.id)).toContain(innerJoin);
  });

  it("多条件组合：关键词 + 日期 + 知识点", async () => {
    const hit = await searchHistory(A.id, "Asia/Taipei", { keyword: "连接", from: "2026-03-10", to: "2026-03-11", conceptIds: [leftJoin], page: 1, pageSize: 10 });
    expect(hit.total).toBe(1);
    const miss = await searchHistory(A.id, "Asia/Taipei", { keyword: "连接", from: "2026-03-11", to: "2026-03-11", conceptIds: [leftJoin], page: 1, pageSize: 10 });
    expect(miss.total).toBe(0);
  });

  it("分页：总数、页数正确，页与页之间不重复", async () => {
    const p1 = await searchHistory(A.id, "Asia/Taipei", { keyword: "星屿", page: 1, pageSize: 5 });
    const p3 = await searchHistory(A.id, "Asia/Taipei", { keyword: "星屿", page: 3, pageSize: 5 });
    expect(p1.total).toBe(13);
    expect(p1.pages).toBe(3);
    expect(p1.hits).toHaveLength(5);
    expect(p3.hits).toHaveLength(3);
    const ids = new Set([...p1.hits, ...p3.hits].map((h) => h.questionId));
    expect(ids.size).toBe(8);
    // 按时间倒序
    const times = p1.hits.map((h) => h.createdAt as unknown as Date).map((d) => +new Date(d));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("权限：只检索本人记录（B 的同名关键词不会出现在 A 的结果中）", async () => {
    const a = await searchHistory(A.id, "Asia/Taipei", { keyword: "LEFT JOIN", page: 1, pageSize: 10 });
    expect(a.hits.every((h) => h.conversationTitle !== "B 的连接问题")).toBe(true);
    const b = await searchHistory(B.id, "Asia/Taipei", { keyword: "LEFT JOIN", page: 1, pageSize: 10 });
    expect(b.total).toBe(1);
    expect(b.hits[0].conversationTitle).toBe("B 的连接问题");
  });

  it("结果定位原消息：打开会话窗口包含该消息及前后文；他人无法打开", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { keyword: "星屿 第 7", page: 1, pageSize: 10 });
    const h = r.hits[0];
    const w = await conversationWindow(A.id, h.conversationId, { aroundMessageId: h.questionId });
    const ids = w.messages.map((m: any) => m.id);
    expect(ids).toContain(h.questionId);
    expect(w.messages.find((m: any) => m.replyToId === h.questionId)).toBeTruthy();
    await expect(conversationWindow(B.id, h.conversationId, { aroundMessageId: h.questionId })).rejects.toMatchObject({ code: "not_found" });
  });

  it("从历史会话继续提问：新消息追加到原会话，刷新（重新读取）后仍在；记录上次上下文", async () => {
    const r = await searchHistory(A.id, "Asia/Taipei", { keyword: "LEFT JOIN", page: 1, pageSize: 10 });
    const conv = r.hits[0].conversationId;
    const before = (await conversationWindow(A.id, conv)).messages.length;
    await sendMessage(A, { conversationId: conv, text: "那 RIGHT JOIN 也会这样吗？" });
    const after = await conversationWindow(A.id, conv);
    expect(after.messages.length).toBe(before + 2);
    expect(after.messages.at(-1)!.status).toBe("complete");
    const u = await q1(`SELECT last_conversation_id FROM users WHERE id = $1`, [A.id]);
    expect(u.last_conversation_id).toBe(conv);
    // 新问题可以被检索到
    const again = await searchHistory(A.id, "Asia/Taipei", { keyword: "RIGHT JOIN", page: 1, pageSize: 10 });
    expect(again.total).toBe(1);
  });
});
