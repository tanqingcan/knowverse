/**
 * 演示数据（全部明确标注）：
 *  - 公共课程目录：数据库系统概论、概率统计两个学科的知识点、别名与先修关系。
 *  - 公共课程资料：seed/materials 下的原创演示资料，走真实的提取—分块—索引流程。
 *  - 题库：SQL（受限沙箱数据集 school_v1）、选择、数值、开放解释题，含变式。
 *  - 演示账号 demo / knowverse（is_demo = true），其预置历史 origin = 'seed'，界面标注“预置”。
 *  - 两个演示同学账号（星野、阿禾），用于班级星系与伙伴匹配展示；不包含任何伪造的讨论内容。
 * 可重复执行：目录与资料已存在则跳过；演示账号每次删除后重建。
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool, q, q1, withTx } from "@/db";
import { hashPassword } from "@/server/auth";
import { normName } from "@/server/text";
import { uploadMaterial, searchMaterials } from "@/server/materials";
import { plantConcept } from "@/server/world";
import { addEvidence, type EvidenceInput } from "@/server/growth";
import { demoAnswer } from "@/server/agent/demo";
import { locationLabel } from "@/server/materials";

const DAY = 86400_000;
const ago = (days: number, hour = 20, minute = 0) => {
  // 以台北时间的某天某时为准
  const now = new Date();
  const tpe = new Date(now.getTime() + 8 * 3600_000);
  const d = new Date(Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth(), tpe.getUTCDate(), hour - 8, minute) - days * DAY);
  return d;
};

/* ───────── 1. 课程目录 ───────── */
const CATALOG = [
  {
    code: "dbms", name: "数据库系统概论", description: "关系模型、SQL、规范化与事务",
    concepts: [
      { name: "SELECT 查询", aliases: ["select", "单表查询", "查询语句"] },
      { name: "内连接", aliases: ["inner join", "等值连接", "内联接"], pre: ["SELECT 查询"] },
      { name: "NULL 与三值逻辑", aliases: ["null", "空值", "三值逻辑", "is null"] },
      { name: "左外连接", aliases: ["left join", "left outer join", "左连接", "左外联接"], pre: ["内连接", "NULL 与三值逻辑"] },
      { name: "连接条件与过滤条件", aliases: ["on 条件", "on 子句", "where 子句", "on 与 where", "on 和 where"], pre: ["左外连接"] },
      { name: "分组聚合", aliases: ["group by", "having", "聚合函数", "分组"], pre: ["SELECT 查询"] },
      { name: "函数依赖", aliases: ["functional dependency", "部分依赖", "传递依赖"] },
      { name: "范式与规范化", aliases: ["3nf", "bcnf", "2nf", "第三范式", "规范化", "范式"], pre: ["函数依赖"] },
      { name: "事务与 ACID", aliases: ["事务", "acid", "transaction"] },
      { name: "索引", aliases: ["index", "b+树"] },
    ],
  },
  {
    code: "prob", name: "概率统计", description: "随机事件、条件概率与随机变量",
    concepts: [
      { name: "样本空间与事件", aliases: ["样本空间", "随机事件"] },
      { name: "条件概率", aliases: ["p(a|b)", "conditional probability"], pre: ["样本空间与事件"] },
      { name: "乘法公式", aliases: ["乘法定理"], pre: ["条件概率"] },
      { name: "全概率公式", aliases: ["全概率", "total probability"], pre: ["乘法公式"] },
      { name: "贝叶斯公式", aliases: ["贝叶斯定理", "bayes", "后验概率"], pre: ["全概率公式"] },
      { name: "事件的独立性", aliases: ["独立性", "相互独立", "independence"], pre: ["条件概率"] },
      { name: "随机变量", aliases: ["random variable", "分布函数"], pre: ["样本空间与事件"] },
    ],
  },
];

async function seedCatalog() {
  const ids: Record<string, string> = {};
  const subj: Record<string, string> = {};
  for (const s of CATALOG) {
    let row = await q1(`SELECT id FROM subjects WHERE code = $1 AND owner_user_id IS NULL`, [s.code]);
    if (!row) row = await q1(`INSERT INTO subjects (code, name, description) VALUES ($1,$2,$3) RETURNING id`, [s.code, s.name, s.description]);
    subj[s.code] = row.id;
    for (const c of s.concepts) {
      let k = await q1(`SELECT id FROM concepts WHERE subject_id = $1 AND name_norm = $2 AND owner_user_id IS NULL`, [row.id, normName(c.name)]);
      if (!k) k = await q1(`INSERT INTO concepts (subject_id, name, name_norm) VALUES ($1,$2,$3) RETURNING id`, [row.id, c.name, normName(c.name)]);
      ids[c.name] = k.id;
      for (const a of c.aliases) await q(`INSERT INTO concept_aliases (concept_id, alias, alias_norm) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [k.id, a, normName(a)]);
    }
    for (const c of s.concepts) for (const p of (c as any).pre ?? []) {
      await q(`INSERT INTO concept_prerequisites (concept_id, prereq_concept_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [ids[c.name], ids[p]]);
    }
  }
  return { ids, subj };
}

/* ───────── 2. 公共资料 ───────── */
async function seedMaterials(subj: Record<string, string>) {
  const dir = path.join(process.cwd(), "seed", "materials");
  const exists = await q1(`SELECT 1 FROM materials WHERE owner_user_id IS NULL LIMIT 1`);
  if (exists) { console.log("  · 公共资料已存在，跳过"); return; }
  const up = async (file: string, subject: string, title: string, kind: string, materialId?: string) => {
    const r = await uploadMaterial({ userId: null, subjectId: subj[subject], title, course: subject === "dbms" ? "数据库系统概论" : "概率统计", kind, fileName: file.replace(/-v\d\.md$/, ".md"), mimeType: null, buf: fs.readFileSync(path.join(dir, file)), materialId });
    console.log(`  · ${title} v${r.versionNo}：${r.status}（${r.detail}）`);
    return r;
  };
  const v1 = await up("连接查询讲义-v1.md", "dbms", "第3章 SQL 连接查询（讲义）", "notes");
  await q(`UPDATE material_versions SET uploaded_at = $2, processed_at = $2 WHERE id = $1`, [v1.versionId, ago(20, 10)]);
  await up("连接查询课件.pptx", "dbms", "第3章 连接查询（课件）", "slides");
  await up("条件概率讲义.pdf", "prob", "条件概率与贝叶斯公式（讲义）", "notes");
  await up("概率统计习题说明.txt", "prob", "第一章习题说明", "exercises");
  await up("扫描版习题-示例.pdf", "prob", "扫描版习题（示例，需 OCR）", "exercises");
  // 自动提取的候选概念：课程资料由“课程管理员”确认（演示数据中直接确认）
  await q(`UPDATE material_concepts SET status = 'confirmed'`);
}

/** 第 2 版讲义（在预置历史之后上传）：之后的检索只使用最新版本；旧回答的引用仍指向第 1 版 */
async function seedMaterialV2(subj: Record<string, string>) {
  const m = await q1(`SELECT m.id FROM materials m WHERE m.owner_user_id IS NULL AND m.title = '第3章 SQL 连接查询（讲义）'`);
  const has = await q1(`SELECT 1 FROM material_versions WHERE material_id = $1 AND version_no = 2`, [m.id]);
  if (has) return;
  const dir = path.join(process.cwd(), "seed", "materials");
  const r = await uploadMaterial({ userId: null, subjectId: subj.dbms, title: "", course: "数据库系统概论", kind: "notes", fileName: "连接查询讲义.md", mimeType: null, buf: fs.readFileSync(path.join(dir, "连接查询讲义-v2.md")), materialId: m.id });
  await q(`UPDATE material_versions SET uploaded_at = $2, processed_at = $2 WHERE id = $1`, [r.versionId, ago(1, 9)]);
  await q(`UPDATE material_concepts SET status = 'confirmed' WHERE version_id = $1`, [r.versionId]);
  console.log(`  · 第3章 SQL 连接查询（讲义） v${r.versionNo}：${r.status}（${r.detail}）`);
}

/* ───────── 3. 题库 ───────── */
type TaskSeed = { family: string; subject: string; kind: string; title: string; concepts: string[]; prompt: string; variant?: boolean; difficulty?: number; spec: any; dataset?: string; hints?: string[] };
const TASKS: TaskSeed[] = [
  {
    family: "leftjoin-count", subject: "dbms", kind: "sql", title: "每位学生的本学期选课数", concepts: ["左外连接", "连接条件与过滤条件"], difficulty: 2, dataset: "school_v1",
    prompt: "列出**所有**学生的姓名 name，以及他们在 2026秋 学期的选课门数 n。没有选课的学生 n 显示 0。",
    spec: { type: "sql", ordered: false, referenceSql: "SELECT s.name, COUNT(e.cid) AS n FROM students s LEFT JOIN enrollments e ON e.sid = s.sid AND e.term = '2026秋' GROUP BY s.sid, s.name",
      diagnostics: [
        { pattern: "left\\s+(outer\\s+)?join[\\s\\S]*where[\\s\\S]*term", message: "提示：你把学期条件写在了 WHERE 中，没有 2026秋 选课的学生会被过滤掉。试着把它移到 ON。" },
        { pattern: "count\\s*\\(\\s*\\*\\s*\\)", message: "提示：COUNT(*) 会把补齐 NULL 的行也计为 1，没选课的学生会显示 1。" },
        { pattern: "^(?![\\s\\S]*left)[\\s\\S]*$", message: "提示：内连接会丢掉没有选课的学生，想想哪种连接能保留左表全部行。" },
      ] },
    hints: ["没选课的学生在 enrollments 中没有对应行。要保留他们，需要哪种连接？", "学期条件是针对右表 enrollments 的；如果写在 WHERE 中会发生什么？", "COUNT(*) 与 COUNT(e.cid) 在右表为 NULL 时结果不同。"],
  },
  {
    family: "leftjoin-count", subject: "dbms", kind: "sql", title: "每门课程的高分人数（变式）", concepts: ["左外连接", "连接条件与过滤条件"], variant: true, difficulty: 3, dataset: "school_v1",
    prompt: "列出**所有**课程名称 title，以及 2026秋 学期选修该课程且成绩 score ≥ 80 的人数 n。没有满足条件的课程 n 显示 0。",
    spec: { type: "sql", ordered: false, referenceSql: "SELECT c.title, COUNT(e.sid) AS n FROM courses c LEFT JOIN enrollments e ON e.cid = c.cid AND e.term = '2026秋' AND e.score >= 80 GROUP BY c.cid, c.title",
      diagnostics: [{ pattern: "left\\s+(outer\\s+)?join[\\s\\S]*where[\\s\\S]*(term|score)", message: "提示：右表条件写在 WHERE 中，会把没有匹配的课程过滤掉。" }, { pattern: "count\\s*\\(\\s*\\*\\s*\\)", message: "提示：COUNT(*) 会把补 NULL 的行计为 1。" }] },
    hints: ["要保留所有课程，左表应该是哪张表？", "学期与分数条件都属于右表。"],
  },
  {
    family: "leftjoin-null", subject: "dbms", kind: "sql", title: "找出没有选课的学生", concepts: ["左外连接", "NULL 与三值逻辑"], difficulty: 2, dataset: "school_v1",
    prompt: "找出**没有任何选课记录**的学生姓名 name。",
    spec: { type: "sql", ordered: false, referenceSql: "SELECT s.name FROM students s LEFT JOIN enrollments e ON e.sid = s.sid WHERE e.sid IS NULL",
      diagnostics: [{ pattern: "=\\s*null", message: "提示：判断空值要用 IS NULL，= NULL 的结果是 UNKNOWN。" }] },
    hints: ["先用左外连接保留所有学生。", "没有匹配的行，右表列是什么值？如何判断？"],
  },
  {
    family: "innerjoin", subject: "dbms", kind: "sql", title: "选修数据库课程的学生成绩", concepts: ["内连接"], difficulty: 1, dataset: "school_v1",
    prompt: "列出选修了课程“数据库系统概论”的学生姓名 name、学期 term 与成绩 score。",
    spec: { type: "sql", ordered: false, referenceSql: "SELECT s.name, e.term, e.score FROM students s, enrollments e, courses c WHERE s.sid = e.sid AND e.cid = c.cid AND c.title = '数据库系统概论'", diagnostics: [] },
    hints: ["需要连接三张表：students、enrollments、courses。", "可以用 FROM a, b, c WHERE 连接条件 AND 筛选条件 的写法。"],
  },
  {
    family: "innerjoin", subject: "dbms", kind: "sql", title: "2026春 的选课清单（变式）", concepts: ["内连接"], variant: true, difficulty: 2, dataset: "school_v1",
    prompt: "列出 2026春 学期的每一条选课记录：学生姓名 name 与课程名称 title。",
    spec: { type: "sql", ordered: false, referenceSql: "SELECT s.name, c.title FROM students s, enrollments e, courses c WHERE s.sid = e.sid AND e.cid = c.cid AND e.term = '2026春'", diagnostics: [] },
  },
  {
    family: "groupby", subject: "dbms", kind: "sql", title: "平均分高于 75 的课程", concepts: ["分组聚合"], difficulty: 2, dataset: "school_v1",
    prompt: "统计每门课程（不分学期）的平均成绩，只列出平均成绩高于 75 的课程名称 title 与平均分 avg_score。",
    spec: { type: "sql", ordered: false, referenceSql: "SELECT c.title, AVG(e.score) AS avg_score FROM courses c, enrollments e WHERE c.cid = e.cid GROUP BY c.cid, c.title HAVING AVG(e.score) > 75",
      diagnostics: [{ pattern: "where[^;]*avg\\s*\\(", message: "提示：聚合条件不能写在 WHERE 中，应使用 HAVING。" }] },
    hints: ["先按课程分组。", "对“组”的筛选用 HAVING。"],
  },
  {
    family: "leftjoin-explain", subject: "dbms", kind: "open", title: "解释 LEFT JOIN 退化的原因", concepts: ["左外连接", "连接条件与过滤条件"], difficulty: 3,
    prompt: "用自己的话解释：为什么在 LEFT JOIN 之后，把右表的条件写在 WHERE 中，查询结果会和内连接一样？并说明如何修改。",
    spec: { type: "open", reference: "左外连接会为没有匹配的左表行补 NULL；WHERE 在连接之后过滤，NULL 与常量比较为 UNKNOWN，这些行被丢掉；修改方法是把右表条件放进 ON，或明确使用 INNER JOIN。",
      dimensions: [
        { key: "null_fill", name: "补齐 NULL", description: "说明左外连接会为没有匹配的行补 NULL", keywords: ["null", "空值", "补齐", "补空"] },
        { key: "where_after", name: "WHERE 的执行时机", description: "说明 WHERE 在连接之后对整行过滤，比较结果为 UNKNOWN 的行被丢掉", keywords: ["之后", "连接后", "unknown", "过滤掉", "筛掉"] },
        { key: "fix", name: "修改方法", description: "给出正确的修改：条件移到 ON，或改用 INNER JOIN", keywords: ["on", "inner join", "内连接"] },
      ] },
  },
  {
    family: "nf-judge", subject: "dbms", kind: "choice", title: "判断最高范式", concepts: ["函数依赖", "范式与规范化"], difficulty: 2,
    prompt: "关系模式 R(学号, 课程号, 姓名, 成绩)，候选键为 (学号, 课程号)，并且 学号 → 姓名。R 最高满足哪个范式？",
    spec: { type: "choice", options: [{ key: "A", text: "1NF" }, { key: "B", text: "2NF" }, { key: "C", text: "3NF" }, { key: "D", text: "BCNF" }], correct: "A", explanation: "姓名部分依赖于候选键 (学号, 课程号)，不满足 2NF。" },
    hints: ["先找非主属性。", "姓名是否依赖于整个候选键？"],
  },
  {
    family: "nf-judge", subject: "dbms", kind: "choice", title: "判断最高范式（变式）", concepts: ["函数依赖", "范式与规范化"], variant: true, difficulty: 3,
    prompt: "关系模式 S(学号, 学院, 院长)，学号为唯一候选键，函数依赖：学号 → 学院，学院 → 院长。S 最高满足哪个范式？",
    spec: { type: "choice", options: [{ key: "A", text: "1NF" }, { key: "B", text: "2NF" }, { key: "C", text: "3NF" }, { key: "D", text: "BCNF" }], correct: "B", explanation: "候选键是单属性，不存在部分依赖，满足 2NF；但 学号 → 学院 → 院长 是传递依赖，不满足 3NF。" },
  },
  {
    family: "cond-basic", subject: "prob", kind: "numeric", title: "同时选两门课的概率", concepts: ["条件概率", "乘法公式"], difficulty: 1,
    prompt: "某班 60% 的学生选修数据库，选修数据库的学生中有 30% 也选修概率统计。随机抽取一名学生，他两门都选的概率是多少？",
    spec: { type: "numeric", answer: 0.18, tolerance: 0.001, explanation: "P(两门) = P(数据库) × P(概率统计 | 数据库) = 0.6 × 0.3 = 0.18。" },
    hints: ["已知的 30% 是哪一个条件概率？", "使用乘法公式 P(AB) = P(B)P(A|B)。"],
  },
  {
    family: "cond-basic", subject: "prob", kind: "numeric", title: "红色牌中的红心 A（变式）", concepts: ["条件概率"], variant: true, difficulty: 2,
    prompt: "从一副 52 张的扑克牌（不含大小王）中随机抽一张。已知抽到的是红色牌，它是红心 A 的概率是多少？（可写分数或小数）",
    spec: { type: "numeric", answer: 1 / 26, tolerance: 0.0005, explanation: "条件为红色牌（26 张），其中红心 A 只有 1 张，P = 1/26 ≈ 0.0385。" },
  },
  {
    family: "bayes", subject: "prob", kind: "numeric", title: "检测阳性后的患病概率", concepts: ["贝叶斯公式", "全概率公式"], difficulty: 3,
    prompt: "某病患病率 1%，检测灵敏度 95%（患病者检测阳性的概率），健康人误报率 5%。某人检测为阳性，他真正患病的概率是多少？（保留三位小数）",
    spec: { type: "numeric", answer: 0.161, tolerance: 0.002, explanation: "P = 0.01×0.95 / (0.01×0.95 + 0.99×0.05) ≈ 0.161。" },
    hints: ["分母用全概率公式求 P(阳性)。", "P(阳性) = P(病)P(阳|病) + P(健康)P(阳|健康)。"],
  },
  {
    family: "bayes", subject: "prob", kind: "numeric", title: "次品来自哪个车间（变式）", concepts: ["贝叶斯公式", "全概率公式"], variant: true, difficulty: 3,
    prompt: "A 车间生产 60% 的产品，次品率 2%；B 车间生产 40%，次品率 5%。随机抽到一件次品，它来自 B 车间的概率是多少？",
    spec: { type: "numeric", answer: 0.625, tolerance: 0.002, explanation: "P(B|次) = 0.4×0.05 / (0.6×0.02 + 0.4×0.05) = 0.02/0.032 = 0.625。" },
  },
  {
    family: "cond-explain", subject: "prob", kind: "open", title: "区分 P(A|B) 与 P(B|A)", concepts: ["条件概率"], difficulty: 2,
    prompt: "用自己的话说明 P(A|B) 与 P(B|A) 的区别，并举一个两者不相等的例子。",
    spec: { type: "open", reference: "P(A|B) 以 B 为条件（样本空间缩小到 B），P(B|A) 以 A 为条件；分母不同，一般不相等；例如检测阳性与患病。",
      dimensions: [
        { key: "condition", name: "条件不同", description: "指出两者的已知条件（缩小后的样本空间）不同", keywords: ["条件", "已知", "样本空间", "分母"] },
        { key: "example", name: "举例", description: "给出一个具体例子", keywords: ["例如", "比如", "例子", "举例"] },
      ] },
  },
  {
    family: "indep", subject: "prob", kind: "choice", title: "互斥与独立", concepts: ["事件的独立性"], difficulty: 2,
    prompt: "若事件 A、B 互斥，且 P(A) > 0，P(B) > 0，则 A 与 B：",
    spec: { type: "choice", options: [{ key: "A", text: "一定独立" }, { key: "B", text: "一定不独立" }, { key: "C", text: "可能独立也可能不独立" }], correct: "B", explanation: "互斥时 P(AB) = 0，而 P(A)P(B) > 0，二者不相等，所以一定不独立。" },
  },
];

async function seedTasks(ids: Record<string, string>, subj: Record<string, string>) {
  const exists = await q1(`SELECT 1 FROM tasks WHERE owner_user_id IS NULL LIMIT 1`);
  if (exists) { console.log("  · 题库已存在，跳过"); return; }
  for (const t of TASKS) {
    await withTx(async (c) => {
      const task = await c.query(`INSERT INTO tasks (subject_id, kind, title, family_key) VALUES ($1,$2,$3,$4) RETURNING id`, [subj[t.subject], t.kind, t.title, t.family]);
      for (const k of t.concepts) await c.query(`INSERT INTO task_concepts (task_id, concept_id) VALUES ($1,$2)`, [task.rows[0].id, ids[k]]);
      const v = await c.query(`INSERT INTO task_versions (task_id, version_no, prompt, is_variant, difficulty, answer_spec, dataset_key, source) VALUES ($1,1,$2,$3,$4,$5,$6,'seed') RETURNING id`,
        [task.rows[0].id, t.prompt, !!t.variant, t.difficulty ?? 2, JSON.stringify(t.spec), t.dataset ?? null]);
      let ord = 0;
      for (const h of t.hints ?? []) await c.query(`INSERT INTO task_hints (task_version_id, ord, content) VALUES ($1,$2,$3)`, [v.rows[0].id, ++ord, h]);
    });
  }
  console.log(`  · 题目 ${TASKS.length} 道`);
}

/* ───────── 4. 演示账号 ───────── */
const DEMO_HANDLES = ["demo", "xingye", "ahe"];

async function removeDemoUsers() {
  const users = await q(`SELECT id FROM users WHERE handle = ANY($1) OR (is_demo AND handle LIKE 'guest-%')`, [DEMO_HANDLES]);
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await withTx(async (c) => {
    await c.query(`DELETE FROM classes WHERE owner_user_id = ANY($1::uuid[])`, [ids]);
    await c.query(`DELETE FROM study_groups WHERE created_by_user_id = ANY($1::uuid[])`, [ids]);
    await c.query(`UPDATE planets SET natal_plant_id = NULL WHERE user_id = ANY($1::uuid[])`, [ids]);
    await c.query(`UPDATE users SET last_conversation_id = NULL, last_plant_id = NULL WHERE id = ANY($1::uuid[])`, [ids]);
    await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
  });
}

async function makeUser(handle: string, name: string, pw: string, at: Date) {
  const r = await q1(`INSERT INTO users (handle, display_name, password_hash, is_demo, onboarded_at, created_at) VALUES ($1,$2,$3,true,$4,$4) RETURNING id`, [handle, name, hashPassword(pw), at]);
  return r.id as string;
}

/** 写入一条证据，并把它产生的证据、成长事件时间改为指定时刻（预置历史） */
async function seedEvidence(c: PoolClient, ev: EvidenceInput, at: Date) {
  const r = await addEvidence(c, { ...ev, origin: "seed" });
  await c.query(`UPDATE learning_evidence SET created_at = $2 WHERE id = $1`, [r.evidenceId, at]);
  await c.query(`UPDATE growth_events SET created_at = $2 WHERE evidence_id = $1`, [r.evidenceId, at]);
  await c.query(`UPDATE learning_states SET last_evidence_at = $3, updated_at = $3,
                   review_due_at = $3::timestamptz + (review_due_at - now())
                 WHERE user_id = $1 AND concept_id = $2`, [ev.userId, ev.conceptId, at]);
  return r;
}

async function seedAttempt(c: PoolClient, userId: string, taskTitle: string, mode: string, answer: string, verdict: string, feedback: string, at: Date, hints = 0) {
  const tv = (await c.query(`SELECT tv.id FROM task_versions tv JOIN tasks t ON t.id = tv.task_id WHERE t.title = $1`, [taskTitle])).rows[0];
  const a = await c.query(`INSERT INTO attempts (user_id, task_version_id, mode, answer, status, submit_key, started_at, submitted_at) VALUES ($1,$2,$3,$4,'evaluated',$5,$6,$6) RETURNING id`,
    [userId, tv.id, mode, answer, `seed-${Math.random().toString(36).slice(2, 12)}`, at]);
  const hs = (await c.query(`SELECT id FROM task_hints WHERE task_version_id = $1 ORDER BY ord LIMIT $2`, [tv.id, hints])).rows;
  for (const h of hs) await c.query(`INSERT INTO hint_events (attempt_id, hint_id, shown_at) VALUES ($1,$2,$3)`, [a.rows[0].id, h.id, at]);
  await c.query(`INSERT INTO evaluations (attempt_id, evaluator, verdict, score, feedback, created_at) VALUES ($1,'seed',$2,$3,$4,$5)`, [a.rows[0].id, verdict, verdict === "correct" ? 1 : 0, feedback, at]);
  return a.rows[0].id as string;
}

/** 预置一段问答：回答由演示回答逻辑 + 真实资料检索生成，引用指向检索到的资料版本 */
async function seedQA(userId: string, convTitle: string, subjectId: string, at: Date, turns: { q: string; tags?: { id: string; status: "candidate" | "confirmed" }[] }[], conversationId?: string) {
  let convId = conversationId;
  if (!convId) convId = (await q1(`INSERT INTO conversations (user_id, title, subject_id, origin, created_at, updated_at) VALUES ($1,$2,$3,'seed',$4,$4) RETURNING id`, [userId, convTitle, subjectId, at])).id;
  let seq = (await q1(`SELECT coalesce(max(seq),0) AS s FROM messages WHERE conversation_id = $1`, [convId])).s;
  let t = at.getTime();
  const out: { questionId: string; answerId: string }[] = [];
  for (const turn of turns) {
    const qid = (await q1(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status, created_at, completed_at) VALUES ($1,$2,$3,'user',$4,'complete',$5,$5) RETURNING id`,
      [convId, userId, ++seq, turn.q, new Date(t)])).id;
    const mats = await searchMaterials(userId, turn.q, { subjectIds: [subjectId], limit: 3 });
    const refs = mats.hits.map((h, i) => ({ ref: `资料${i + 1}`, chunkId: h.chunkId, materialTitle: h.materialTitle, versionNo: h.versionNo, location: locationLabel(h), content: h.content }));
    const ans = demoAnswer({ text: turn.q, intent: "ask", materials: refs, history: [] });
    t += 40_000;
    const mc = (await q1(`INSERT INTO model_calls (user_id, purpose, mode, provider, model, status, started_at, finished_at, latency_ms, tool_trace) VALUES ($1,'chat','demo','demo','fixed-demo','ok',$2,$2,12,$3) RETURNING id`,
      [userId, new Date(t), JSON.stringify([{ note: "预置演示历史" }])])).id;
    const aid = (await q1(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status, mode, reply_to_id, basis, model_call_id, created_at, completed_at) VALUES ($1,$2,$3,'assistant',$4,'complete','demo',$5,$6,$7,$8,$8) RETURNING id`,
      [convId, userId, ++seq, ans.answer, qid, ans.basis, mc, new Date(t)])).id;
    let ord = 0;
    for (const cit of ans.citations) {
      const m = refs.find((r) => r.ref === cit.ref);
      if (m) await q(`INSERT INTO message_citations (message_id, chunk_id, ref_label, quote, ord) VALUES ($1,$2,$3,$4,$5)`, [aid, m.chunkId, m.ref, m.content.slice(0, 400), ++ord]);
    }
    for (const tag of turn.tags ?? []) await q(`INSERT INTO message_concepts (message_id, concept_id, source, status, created_at, decided_at) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT DO NOTHING`,
      [qid, tag.id, tag.status === "confirmed" ? "user" : "ai", tag.status, new Date(t)]);
    out.push({ questionId: qid, answerId: aid });
    t += 5 * 60_000;
  }
  await q(`UPDATE conversations SET updated_at = $2 WHERE id = $1`, [convId, new Date(t)]);
  return { conversationId: convId!, turns: out };
}

async function seedDemo(ids: Record<string, string>, subj: Record<string, string>) {
  await removeDemoUsers();
  const demo = await makeUser("demo", "小屿", "knowverse", ago(14, 21));
  const look: Record<string, { species: string; color: string; nickname?: string }> = {
    "左外连接": { species: "rose", color: "rose", nickname: "晚星" },
    "内连接": { species: "iris", color: "mist" },
    "分组聚合": { species: "lily", color: "cream" },
    "函数依赖": { species: "sunflower", color: "gold" },
    "条件概率": { species: "sunflower", color: "coral" },
    "贝叶斯公式": { species: "iris", color: "sky" },
    "全概率公式": { species: "lily", color: "mist" },
  };
  const plantIds: Record<string, string> = {};
  await withTx(async (c) => {
    const planet = await c.query(`INSERT INTO planets (user_id, name, created_at) VALUES ($1,'小屿星',$2) RETURNING id`, [demo, ago(14, 21)]);
    const g1 = await c.query(`INSERT INTO learning_goals (user_id, subject_id, title, created_at) VALUES ($1,$2,'弄懂 LEFT JOIN 与 WHERE 对查询结果的影响',$3) RETURNING id`, [demo, subj.dbms, ago(14, 21)]);
    const g2 = await c.query(`INSERT INTO learning_goals (user_id, subject_id, title, created_at) VALUES ($1,$2,'能独立用贝叶斯公式解应用题',$3) RETURNING id`, [demo, subj.prob, ago(10, 20)]);
    const route1 = ["内连接", "左外连接", "分组聚合", "函数依赖"];
    const route2 = ["条件概率", "全概率公式", "贝叶斯公式"];
    let o = 0; for (const k of route1) await c.query(`INSERT INTO goal_concepts (goal_id, concept_id, route_order) VALUES ($1,$2,$3)`, [g1.rows[0].id, ids[k], ++o]);
    o = 0; for (const k of route2) await c.query(`INSERT INTO goal_concepts (goal_id, concept_id, route_order) VALUES ($1,$2,$3)`, [g2.rows[0].id, ids[k], ++o]);
    for (const k of [...route1, ...route2]) {
      const p = await plantConcept(c, demo, ids[k], look[k], "seed");
      plantIds[k] = p.plantId;
      const when = route1.includes(k) ? ago(14, 21, 5) : ago(10, 20, 5);
      await c.query(`UPDATE plants SET created_at = $2 WHERE id = $1`, [p.plantId, when]);
      await c.query(`UPDATE growth_events SET created_at = $3 WHERE user_id = $1 AND concept_id = $2 AND event_type = 'planted'`, [demo, ids[k], when]);
    }
    await c.query(`UPDATE planets SET natal_plant_id = $2 WHERE id = $1`, [planet.rows[0].id, plantIds["左外连接"]]);
    await c.query(`INSERT INTO growth_events (user_id, concept_id, event_type, reason, origin, created_at) VALUES ($1,$2,'natal_chosen','选为本命花「晚星」','seed',$3)`, [demo, ids["左外连接"], ago(14, 21, 6)]);
    await c.query(`UPDATE learning_states SET updated_at = $2, review_due_at = NULL WHERE user_id = $1`, [demo, ago(14, 21)]);
  });

  // 预置历史问答
  const c1 = await seedQA(demo, "逗号写法和 INNER JOIN 一样吗", subj.dbms, ago(12, 20, 10), [
    { q: "FROM a, b WHERE a.k = b.k 这种写法和 INNER JOIN 的结果一样吗？", tags: [{ id: ids["内连接"], status: "confirmed" }] },
  ]);
  const c2 = await seedQA(demo, "LEFT JOIN 之后学生变少了", subj.dbms, ago(9, 21, 30), [
    { q: "我用 LEFT JOIN 连接学生表和选课表，为什么没选课的学生还是没出来？我在 WHERE 里写了学期条件。", tags: [{ id: ids["左外连接"], status: "candidate" }, { id: ids["连接条件与过滤条件"], status: "candidate" }] },
  ]);
  const c3 = await seedQA(demo, "条件概率的两个方向", subj.prob, ago(9, 15, 0), [
    { q: "条件概率 P(A|B) 和 P(B|A) 有什么区别？", tags: [{ id: ids["条件概率"], status: "confirmed" }] },
  ]);
  const c4 = await seedQA(demo, "GROUP BY 和 HAVING", subj.dbms, ago(6, 19, 40), [
    { q: "GROUP BY 之后为什么不能在 WHERE 里写 AVG(score) > 75？", tags: [{ id: ids["分组聚合"], status: "confirmed" }] },
  ]);
  const c5 = await seedQA(demo, "第三范式怎么判断", subj.dbms, ago(4, 22, 0), [
    { q: "怎么判断一个关系模式是不是第三范式？函数依赖要怎么找？", tags: [{ id: ids["函数依赖"], status: "confirmed" }, { id: ids["范式与规范化"], status: "candidate" }] },
  ]);
  const c6 = await seedQA(demo, "贝叶斯公式的分母", subj.prob, ago(2, 20, 30), [
    { q: "贝叶斯公式的分母为什么是全概率公式？", tags: [{ id: ids["贝叶斯公式"], status: "confirmed" }, { id: ids["全概率公式"], status: "candidate" }] },
  ]);

  // 预置长期记忆（B4 记忆面板）：fact / preference，来源指向上面预置问答的具体消息
  for (const mem of [
    { kind: "fact", content: "LEFT JOIN 时，右表的过滤条件要写在 ON 子句里；写在 WHERE 会把未匹配的左表行也过滤掉。", concept: "左外连接", messageId: c2.turns[0].answerId, conversationId: c2.conversationId },
    { kind: "fact", content: "GROUP BY 之后的聚合过滤（如 AVG > 75）要写在 HAVING 里，不能写在 WHERE。", concept: "分组聚合", messageId: c4.turns[0].answerId, conversationId: c4.conversationId },
    { kind: "preference", content: "学贝叶斯公式时，更喜欢从「检测阳性后的患病概率」这类应用题入手。", concept: "贝叶斯公式", messageId: c6.turns[0].questionId, conversationId: c6.conversationId },
  ]) {
    await q(`INSERT INTO memories (user_id, kind, content, concept_id, source_message_id, source_conversation_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [demo, mem.kind, mem.content, ids[mem.concept], mem.messageId, mem.conversationId]);
  }

  await withTx(async (c) => {
    const E = (conceptId: string, kind: any, detail: string, extra: Partial<EvidenceInput> = {}) => ({ userId: demo, conceptId, kind, detail, ...extra });
    // 内连接：提问 → 引导练习 → 独立作答（非变式）= 花苞
    await seedEvidence(c, E(ids["内连接"], "asked", "围绕该知识点提问：“FROM a, b WHERE a.k = b.k 这种写法…”", { messageId: c1.turns[0].questionId }), ago(12, 20, 12));
    let a = await seedAttempt(c, demo, "选修数据库课程的学生成绩", "guided", "SELECT s.name, e.term, e.score FROM students s, enrollments e, courses c WHERE s.sid = e.sid AND e.cid = c.cid AND c.title = '数据库系统概论'", "correct", "正确：结果集合与期望一致。", ago(11, 21), 1);
    await seedEvidence(c, E(ids["内连接"], "guided_practice", "《选修数据库课程的学生成绩》引导模式，使用提示 1 次，结果：正确", { attemptId: a, usedHints: true }), ago(11, 21));
    a = await seedAttempt(c, demo, "选修数据库课程的学生成绩", "independent", "SELECT s.name, e.term, e.score FROM students s JOIN enrollments e ON s.sid = e.sid JOIN courses c ON e.cid = c.cid WHERE c.title = '数据库系统概论'", "correct", "正确：结果集合与期望一致。", ago(8, 20));
    await seedEvidence(c, E(ids["内连接"], "independent_attempt", "《选修数据库课程的学生成绩》独立作答，未使用提示，结果：正确（重复题目，不计为新的迁移证据）（非变式题，开花需要独立变式验证）", { attemptId: a }), ago(8, 20));
    // 分组聚合：提问 = 嫩芽
    await seedEvidence(c, E(ids["分组聚合"], "asked", "围绕该知识点提问：“GROUP BY 之后为什么不能在 WHERE 里…”", { messageId: c4.turns[0].questionId }), ago(6, 19, 42));
    // 函数依赖：提问 + 笔记 + 引导练习 = 生叶
    await seedEvidence(c, E(ids["函数依赖"], "asked", "围绕该知识点提问：“怎么判断一个关系模式是不是第三范式？…”", { messageId: c5.turns[0].questionId }), ago(4, 22, 2));
    const note = await c.query(`INSERT INTO notes (user_id, concept_id, source_message_id, title, content, created_at, updated_at) VALUES ($1,$2,$3,'找函数依赖的顺序','先确定候选键；再看每个非主属性是依赖整个键、键的一部分，还是经由别的非主属性传递。',$4,$4) RETURNING id`,
      [demo, ids["函数依赖"], c5.turns[0].questionId, ago(4, 22, 20)]);
    await seedEvidence(c, E(ids["函数依赖"], "note", "写下笔记《找函数依赖的顺序》", { noteId: note.rows[0].id }), ago(4, 22, 20));
    a = await seedAttempt(c, demo, "判断最高范式", "guided", "A", "correct", "正确。姓名部分依赖于候选键 (学号, 课程号)，不满足 2NF。", ago(3, 21), 2);
    await seedEvidence(c, E(ids["函数依赖"], "guided_practice", "《判断最高范式》引导模式，使用提示 2 次，结果：正确", { attemptId: a, usedHints: true }), ago(3, 21));
    // 条件概率：提问 → 引导 → 独立 → 独立变式通过 = 开花
    await seedEvidence(c, E(ids["条件概率"], "asked", "围绕该知识点提问：“条件概率 P(A|B) 和 P(B|A) 有什么区别？”", { messageId: c3.turns[0].questionId }), ago(9, 15, 2));
    a = await seedAttempt(c, demo, "同时选两门课的概率", "guided", "0.18", "correct", "正确（0.18）。", ago(9, 15, 30), 1);
    await seedEvidence(c, E(ids["条件概率"], "guided_practice", "《同时选两门课的概率》引导模式，使用提示 1 次，结果：正确", { attemptId: a, usedHints: true }), ago(9, 15, 30));
    a = await seedAttempt(c, demo, "红色牌中的红心 A（变式）", "independent", "1/26", "correct", "正确（0.0385）。", ago(7, 21));
    await seedEvidence(c, E(ids["条件概率"], "independent_attempt", "《红色牌中的红心 A（变式）》独立变式，已独立作答", { attemptId: a }), ago(7, 21));
    await seedEvidence(c, E(ids["条件概率"], "independent_variant_pass", "《红色牌中的红心 A（变式）》独立变式，首次作答、未使用提示，结果：正确", { attemptId: a }), ago(7, 21));
    // 贝叶斯：提问 = 嫩芽；做错一道独立题 = 花苞（答错不会退化）
    await seedEvidence(c, E(ids["贝叶斯公式"], "asked", "围绕该知识点提问：“贝叶斯公式的分母为什么是全概率公式？”", { messageId: c6.turns[0].questionId }), ago(2, 20, 32));
    a = await seedAttempt(c, demo, "检测阳性后的患病概率", "independent", "0.95", "incorrect", "你的结果是 0.95，与参考值不一致。P = 0.01×0.95 / (0.01×0.95 + 0.99×0.05) ≈ 0.161。", ago(2, 21));
    await seedEvidence(c, E(ids["贝叶斯公式"], "independent_attempt", "《检测阳性后的患病概率》独立作答，未使用提示，结果：未通过", { attemptId: a }), ago(2, 21));
    await seedEvidence(c, E(ids["全概率公式"], "independent_attempt", "《检测阳性后的患病概率》独立作答，未使用提示，结果：未通过", { attemptId: a }), ago(2, 21));
    // 自述理解：被记录，但不推动阶段
    await seedEvidence(c, E(ids["全概率公式"], "self_report", "我觉得全概率公式就是分情况加起来"), ago(2, 21, 10));
  });
  await q(`UPDATE users SET last_plant_id = $2 WHERE id = $1`, [demo, plantIds["左外连接"]]);

  // 演示同学（只用于班级星系与匹配；不预置任何讨论内容）
  const xy = await makeUser("xingye", "星野（演示同学）", "knowverse", ago(13, 20));
  const ah = await makeUser("ahe", "阿禾（演示同学）", "knowverse", ago(12, 20));
  for (const [uid, pname, plants] of [
    [xy, "星野的星球", [["左外连接", "iris", "sky"], ["内连接", "sunflower", "gold"], ["贝叶斯公式", "rose", "cream"]]],
    [ah, "阿禾的小站", [["函数依赖", "lily", "coral"], ["范式与规范化", "rose", "mist"], ["条件概率", "iris", "rose"]]],
  ] as const) {
    await withTx(async (c) => {
      const pl = await c.query(`INSERT INTO planets (user_id, name) VALUES ($1,$2) RETURNING id`, [uid, pname]);
      let first: string | null = null;
      for (const [k, sp, col] of plants) { const p = await plantConcept(c, uid, ids[k], { species: sp, color: col }, "seed"); first ??= p.plantId; }
      await c.query(`UPDATE planets SET natal_plant_id = $2 WHERE id = $1`, [pl.rows[0].id, first]);
      await c.query(`INSERT INTO learning_goals (user_id, subject_id, title) VALUES ($1,$2,'期中复习')`, [uid, subj.dbms]);
      await seedEvidence(c, { userId: uid, conceptId: ids[plants[0][0]], kind: "asked", detail: "预置：提问记录" }, ago(5, 20));
    });
  }
  // 班级星系
  const cls = await withTx(async (c) => {
    const r = await c.query(`INSERT INTO classes (name, join_code, owner_user_id) VALUES ('数据库系统概论 · 星系 A','KV2026',$1) RETURNING id`, [ah]);
    const id = r.rows[0].id;
    for (const [uid, role, sp, ss, op] of [[ah, "teacher", true, true, true], [xy, "student", true, true, true], [demo, "student", true, false, true]] as const) {
      await c.query(`INSERT INTO class_members (class_id, user_id, role) VALUES ($1,$2,$3)`, [id, uid, role]);
      await c.query(`INSERT INTO sharing_preferences (class_id, user_id, share_planet, share_stages, open_to_partner) VALUES ($1,$2,$3,$4,$5)`, [id, uid, sp, ss, op]);
    }
    for (const [uid, k, d] of [[demo, "左外连接", "seek"], [demo, "条件概率", "offer"], [xy, "左外连接", "offer"], [xy, "贝叶斯公式", "seek"], [xy, "条件概率", "seek"], [ah, "函数依赖", "offer"], [ah, "左外连接", "seek"]] as const) {
      await c.query(`INSERT INTO learning_intents (class_id, user_id, concept_id, direction) VALUES ($1,$2,$3,$4)`, [id, uid, ids[k], d]);
    }
    const g = await c.query(`INSERT INTO study_groups (class_id, concept_id, title, capacity, created_by_user_id) VALUES ($1,$2,'LEFT JOIN 互讲（双人）',2,$3) RETURNING id`, [id, ids["左外连接"], xy]);
    await c.query(`INSERT INTO study_group_members (group_id, user_id) VALUES ($1,$2)`, [g.rows[0].id, xy]);
    return id;
  });
  console.log(`  · 演示账号 demo / knowverse（小屿），演示同学 xingye、ahe（密码 knowverse），班级邀请码 KV2026 (${cls.slice(0, 8)})`);
}

async function main() {
  console.log("→ 课程目录"); const { ids, subj } = await seedCatalog();
  console.log("→ 公共资料"); await seedMaterials(subj);
  console.log("→ 题库"); await seedTasks(ids, subj);
  console.log("→ 演示账号与预置历史"); await seedDemo(ids, subj);
  console.log("→ 资料新版本"); await seedMaterialV2(subj);
  await pool.end();
  console.log("✓ seed 完成");
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
