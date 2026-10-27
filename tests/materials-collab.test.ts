/** 资料解析（PPTX 页号、PDF 页码、扫描件、不支持的类型、伪造扩展名）、权限，以及增强功能（并发名额、伙伴匹配、先修环、outbox） */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { q, q1, makeUser, concept, subject } from "./helpers";
import { uploadMaterial, materialDetail, searchMaterials } from "@/server/materials";
import { createClass, joinClass, setSharing, addIntent, findPartners, createGroup, joinGroup, drainOutbox, galaxy } from "@/server/classes";
import type { CurrentUser } from "@/server/auth";

let U: CurrentUser, V: CurrentUser;
let sid: string;
const seedDir = path.join(process.cwd(), "seed", "materials");
beforeAll(async () => { U = await makeUser("mat"); V = await makeUser("matv"); sid = await subject("dbms"); });

describe("资料提取", () => {
  it("PPTX：按幻灯片顺序保存页号", async () => {
    const r = await uploadMaterial({ userId: U.id, subjectId: sid, title: "课件", course: "测试", kind: "slides", fileName: "deck.pptx", mimeType: null, buf: fs.readFileSync(path.join(seedDir, "连接查询课件.pptx")) });
    expect(r.status).toBe("ready");
    const d = await materialDetail(U.id, r.materialId);
    const pages = d.chunks.map((c: any) => c.pageNo);
    expect(pages[0]).toBe(1);
    expect(d.chunks.find((c: any) => c.content.includes("ON 与 WHERE"))!.pageNo).toBe(4);
  });

  it("文本 PDF：保存页码，并规范化部首字符（⽤→用）", async () => {
    const r = await uploadMaterial({ userId: U.id, subjectId: await subject("prob"), title: "讲义", course: "测试", kind: "notes", fileName: "a.pdf", mimeType: null, buf: fs.readFileSync(path.join(seedDir, "条件概率讲义.pdf")) });
    expect(r.status).toBe("ready");
    const d = await materialDetail(U.id, r.materialId);
    expect(d.chunks.find((c: any) => c.content.includes("贝叶斯公式"))!.pageNo).toBe(3);
    expect(d.chunks.some((c: any) => /[⺀-⿟]/.test(c.content))).toBe(false);
  });

  it("扫描版 PDF：标记为需要 OCR，不生成任何片段", async () => {
    const r = await uploadMaterial({ userId: U.id, subjectId: sid, title: "扫描件", course: "测试", kind: "exercises", fileName: "scan.pdf", mimeType: null, buf: fs.readFileSync(path.join(seedDir, "扫描版习题-示例.pdf")) });
    expect(r.status).toBe("needs_ocr");
    expect(r.chunkCount).toBe(0);
  });

  it("暂不支持的类型：只保存元数据，状态 unsupported", async () => {
    const zip = new JSZip(); zip.file("[Content_Types].xml", "<Types/>"); zip.file("word/document.xml", "<w:document/>");
    const r = await uploadMaterial({ userId: U.id, subjectId: sid, title: "Word", course: "测试", kind: "other", fileName: "a.docx", mimeType: null, buf: await zip.generateAsync({ type: "nodebuffer" }) });
    expect(r.status).toBe("unsupported");
    const v = await q1(`SELECT byte_size, sha256, file_type FROM material_versions WHERE id = $1`, [r.versionId]);
    expect(v.file_type).toBe("other");
    expect(v.byte_size).toBeGreaterThan(0);
  });

  it("文件校验：扩展名与内容不符、非 UTF-8 文本、空文件都被拒绝", async () => {
    await expect(uploadMaterial({ userId: U.id, subjectId: sid, title: "x", course: "t", kind: "notes", fileName: "fake.pdf", mimeType: null, buf: Buffer.from("not a pdf") })).rejects.toMatchObject({ code: "bad_file" });
    await expect(uploadMaterial({ userId: U.id, subjectId: sid, title: "x", course: "t", kind: "notes", fileName: "gbk.txt", mimeType: null, buf: Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0xff]) })).rejects.toMatchObject({ code: "bad_file" });
    await expect(uploadMaterial({ userId: U.id, subjectId: sid, title: "x", course: "t", kind: "notes", fileName: "e.txt", mimeType: null, buf: Buffer.alloc(0) })).rejects.toMatchObject({ code: "empty_file" });
  });

  it("损坏的 PPTX：解析失败并说明原因（不假装成功）", async () => {
    const zip = new JSZip(); zip.file("hello.txt", "x");
    const r = await uploadMaterial({ userId: U.id, subjectId: sid, title: "坏课件", course: "t", kind: "slides", fileName: "bad.pptx", mimeType: null, buf: await zip.generateAsync({ type: "nodebuffer" }) });
    expect(r.status).toBe("failed");
  });

  it("权限：他人的个人资料不可见、不可检索；课程公共资料对所有人可见", async () => {
    const r = await uploadMaterial({ userId: U.id, subjectId: sid, title: "私人笔记", course: "t", kind: "notes", fileName: "p.md", mimeType: null, buf: Buffer.from("星屿私密关键词 LEFT JOIN 的私人理解") });
    await expect(materialDetail(V.id, r.materialId)).rejects.toMatchObject({ code: "not_found" });
    const vs = await searchMaterials(V.id, "星屿私密关键词 LEFT JOIN");
    expect(vs.hits.some((h) => h.materialId === r.materialId)).toBe(false);
    const us = await searchMaterials(U.id, "星屿私密关键词 LEFT JOIN");
    expect(us.hits.some((h) => h.materialId === r.materialId)).toBe(true);
    expect((await searchMaterials(V.id, "LEFT JOIN WHERE")).hits.length).toBeGreaterThan(0);
  });
});

describe("增强功能", () => {
  it("并发申请最后一个共学名额：恰好一人成功，不超员", async () => {
    const owner = await makeUser("own");
    const { classId, joinCode } = await createClass(owner, "并发测试班");
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => makeUser(`cc${i}`)));
    for (const u of users) await joinClass(u, joinCode);
    const { groupId } = await createGroup(owner, { classId, conceptId: await concept("左外连接"), title: "双人互讲", capacity: 2 });
    const results = await Promise.allSettled(users.map((u) => joinGroup(u.id, groupId)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as any).code === "group_full").length).toBe(5);
    expect((await q1(`SELECT count(*)::int n FROM study_group_members WHERE group_id = $1`, [groupId])).n).toBe(2);
  });

  it("互补伙伴匹配只使用公开意愿，并给出可解释理由；未开启匹配的人不出现", async () => {
    const a = await makeUser("pa"), b = await makeUser("pb"), c = await makeUser("pc");
    const { classId, joinCode } = await createClass(a, "匹配测试班");
    await joinClass(b, joinCode); await joinClass(c, joinCode);
    const lj = await concept("左外连接"), cp = await concept("条件概率");
    await addIntent(a, { classId, conceptId: lj, direction: "seek" });
    await addIntent(a, { classId, conceptId: cp, direction: "offer" });
    await addIntent(b, { classId, conceptId: lj, direction: "offer" });
    await addIntent(b, { classId, conceptId: cp, direction: "seek" });
    await addIntent(c, { classId, conceptId: lj, direction: "offer" });
    await setSharing(a, classId, { openToPartner: true });
    await setSharing(b, classId, { openToPartner: true });
    const m = await findPartners(a.id, classId);
    expect(m).toHaveLength(1);                 // c 未开启匹配
    expect(m[0].userId).toBe(b.id);
    expect(m[0].mutual).toBe(true);
    expect(m[0].why).toContain("左外连接");
    // 星系只显示公开的星球
    const g = await galaxy(a, classId);
    expect(g.planets.map((p: any) => p.userId)).toEqual([a.id]);
    expect(g.hiddenCount).toBe(2);
  });

  it("先修关系：递归 CTE 触发器拒绝形成环", async () => {
    const lj = await concept("左外连接"), ij = await concept("内连接");
    // 已有：左外连接 → 先修 内连接；再让内连接以左外连接为先修就会成环
    await expect(q(`INSERT INTO concept_prerequisites (concept_id, prereq_concept_id) VALUES ($1, $2)`, [ij, lj])).rejects.toThrow(/cycle/);
  });

  it("outbox：成长事件在业务事务内写入，事务外投递并标记", async () => {
    const before = (await q1(`SELECT count(*)::int n FROM outbox_events WHERE delivered_at IS NULL`)).n;
    expect(before).toBeGreaterThan(0);
    const r = await drainOutbox(1000);
    expect(r.delivered).toBe(before);
    expect((await q1(`SELECT count(*)::int n FROM outbox_events WHERE delivered_at IS NULL`)).n).toBe(0);
  });
});
