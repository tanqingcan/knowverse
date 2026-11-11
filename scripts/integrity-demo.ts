import "./env";
import { Client } from "pg";

/**
 * 完整性违约演示（第 5 章）
 *
 * 每种完整性规则都故意触发一次，打印 SQLSTATE 与约束名——答辩时可以说明
 * “这条规则不是口头约定，是数据库拒绝了我”。
 */
const URL_DB = process.env.DATABASE_URL!;
type Row = { rule: string; attempt: string; code: string; constraint: string; message: string };

async function main() {
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  const rows: Row[] = [];

  const one = async <T = any>(sql: string, params: any[] = []): Promise<T> => (await c.query(sql, params)).rows[0];
  const demo = (await one<{ id: string }>(`SELECT id FROM users WHERE handle = 'demo'`))!.id;
  const cls = (await one<{ id: string }>(`SELECT id FROM classes LIMIT 1`))!.id;
  const conv = (await one<{ id: string }>(`SELECT id FROM conversations WHERE user_id = $1 LIMIT 1`, [demo]))!.id;
  const concept = (await one<{ id: string }>(`SELECT id FROM concepts WHERE name = '内连接' AND owner_user_id IS NULL`))!.id;
  const task = (await one<{ id: string }>(`SELECT id FROM tasks LIMIT 1`))!.id;

  async function attempt(rule: string, label: string, fn: (tx: Client) => Promise<unknown>, commit = false) {
    await c.query("BEGIN");
    try {
      await fn(c);
      if (commit) await c.query("COMMIT"); else await c.query("ROLLBACK");
      rows.push({ rule, attempt: label, code: "—", constraint: "—", message: "没有报错（说明约束缺失）" });
    } catch (e: any) {
      await c.query("ROLLBACK").catch(() => {});
      rows.push({
        rule, attempt: label, code: e.code ?? "?",
        constraint: e.constraint ?? (String(e.message).match(/constraint "([^"]+)"/)?.[1] ?? e.routine ?? "—"),
        message: String(e.message).split("\n")[0].slice(0, 70),
      });
    }
  }

  await attempt("实体完整性（主键）", "重复插入同一个 (班级, 成员)", async (tx) => {
    const u = await tx.query(`SELECT user_id FROM class_members WHERE class_id = $1 LIMIT 1`, [cls]);
    await tx.query(`INSERT INTO class_members (class_id, user_id) VALUES ($1, $2)`, [cls, u.rows[0].user_id]);
  });

  await attempt("参照完整性（外键）", "消息指向不存在的会话", async (tx) => {
    await tx.query(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status)
                    VALUES ($1, $2, 999999, 'user', '孤儿消息', 'complete')`, ["00000000-0000-0000-0000-000000000000", demo]);
  });

  await attempt("参照完整性（RESTRICT）", "删除仍被其他表引用的知识点", async (tx) => {
    await tx.query(`DELETE FROM concepts WHERE id = $1`, [concept]);
  });

  await attempt("用户定义完整性（CHECK）", "把消息状态写成非法值", async (tx) => {
    await tx.query(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status)
                    VALUES ($1, $2, 999998, 'user', '非法状态', 'bogus')`, [conv, demo]);
  });

  await attempt("用户定义完整性（NOT NULL）", "插入内容为空的消息", async (tx) => {
    await tx.query(`INSERT INTO messages (conversation_id, user_id, seq, role, content, status)
                    VALUES ($1, $2, 999997, 'user', NULL, 'complete')`, [conv, demo]);
  });

  await attempt("用户定义完整性（唯一约束）", "重复的班级邀请码", async (tx) => {
    const code = (await one<{ join_code: string }>(`SELECT join_code FROM classes LIMIT 1`))!.join_code;
    await tx.query(`INSERT INTO classes (name, join_code, owner_user_id) VALUES ('重复码班级', $1, $2)`, [code, demo]);
  });

  await attempt("触发器（先修关系防环）", "让 内连接 依赖它自己的后继", async (tx) => {
    const next = (await one<{ concept_id: string }>(
      `SELECT concept_id FROM concept_prerequisites WHERE prereq_concept_id = $1 LIMIT 1`, [concept]))?.concept_id;
    await tx.query(`INSERT INTO concept_prerequisites (concept_id, prereq_concept_id) VALUES ($1, $2)`, [concept, next ?? concept]);
  });

  await attempt("延迟约束（DEFERRABLE）", "把本命花改成别人星球上的花", async (tx) => {
    const p = await one<{ id: string }>(`SELECT id FROM planets WHERE user_id = $1`, [demo]);
    const other = await one<{ id: string }>(
      `SELECT p.id FROM plants p JOIN gardens g ON g.id = p.garden_id
        WHERE g.planet_id <> $1 LIMIT 1`, [p.id]);
    await tx.query(`UPDATE planets SET natal_plant_id = $2 WHERE id = $1`, [p.id, other.id]);
  }, true); // 延迟约束在 COMMIT 时才检查

  await attempt("触发器（共学名额）", "先填满小组，再插最后一个人", async (tx) => {
    const g = await one<{ id: string; capacity: number }>(`SELECT id, capacity FROM study_groups LIMIT 1`);
    const cnt = Number((await one<{ n: number }>(`SELECT count(*)::int n FROM study_group_members WHERE group_id = $1`, [g.id]))!.n);
    const free = await tx.query(
      `SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM study_group_members WHERE group_id = $1) LIMIT $2`,
      [g.id, Math.max(1, g.capacity - cnt + 1)]);
    const ids = free.rows.map((r: any) => r.id);
    for (let i = 0; i < g.capacity - cnt && i < ids.length; i++) {
      await tx.query(`INSERT INTO study_group_members (group_id, user_id) VALUES ($1, $2)`, [g.id, ids[i]]);
    }
    const extra = ids[g.capacity - cnt] ?? ids[ids.length - 1];
    await tx.query(`INSERT INTO study_group_members (group_id, user_id) VALUES ($1, $2)`, [g.id, extra]);
  });

  // 汇总
  console.log("\n完整性违约演示（数据库拒绝了以下操作）\n");
  for (const r of rows) {
    console.log(`【${r.rule}】${r.attempt}`);
    console.log(`   SQLSTATE=${r.code}  约束=${r.constraint}`);
    console.log(`   ${r.message}\n`);
  }
  const pass = rows.filter((r) => r.code !== "—").length;
  console.log(`${pass}/${rows.length} 项被数据库按预期拒绝。`);

  const md = [
    "# 完整性违约演示（第 5 章）",
    "",
    "> 由 `npm run demo:integrity` 生成；每条都在事务里执行并回滚，不会留下脏数据。",
    "",
    "| 完整性规则 | 违约尝试 | SQLSTATE | 约束/触发器 |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.rule} | ${r.attempt} | \`${r.code}\` | \`${r.constraint}\` |`),
    "",
    "## 说明",
    "",
    "- **实体完整性**：主键/唯一索引拒绝重复元组（`23505`）。",
    "- **参照完整性**：外键拒绝孤儿引用（`23503`）；`RESTRICT` 拒绝删除被引用行；`CASCADE`/`SET NULL` 的行为在迁移里声明。",
    "- **用户定义完整性**：`CHECK`（`23514`）、`NOT NULL`（`23502`）、唯一约束（`23505`）。",
    "- **触发器**：先修关系防环、共学名额等跨行规则由触发器保证（`23514`/`P0001`）。",
    "- **延迟约束**：本命花的归属检查在 `COMMIT` 时才触发（`DEFERRABLE INITIALLY DEFERRED`），允许同一事务里先建星球再建植物。",
    "- 课程提到的 **ASSERTION**：PostgreSQL 不提供 `CREATE ASSERTION`，跨表断言只能用触发器/约束触发器表达，这里正是这样实现的。",
  ].join("\n");
  const fs = await import("node:fs");
  fs.writeFileSync("docs/sql/integrity-demo.md", md + "\n", "utf8");
  console.log("✓ 已写入 docs/sql/integrity-demo.md");
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
