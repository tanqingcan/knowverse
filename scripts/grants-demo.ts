import "./env";
import { Client } from "pg";

/**
 * 授权与视图机制演示（第 4.2 自主存取控制 / 4.3 视图机制）
 *
 * 全部在事务里做，结束 ROLLBACK：不会改变生产权限。
 *   1. 运行时角色 kv_app 没有 DDL 权限
 *   2. 教师角色只能读视图，不能读底层表
 *   3. REVOKE 立刻生效，ROLLBACK 恢复
 *   4. WITH GRANT OPTION：被授权者可以再转授
 *   5. 列级权限：只授予部分列，SELECT * 会被拒绝
 */
const URL_DB = process.env.DATABASE_URL!;
type Row = { item: string; result: string; detail: string };

async function main() {
  const c = new Client({ connectionString: URL_DB });
  await c.connect();
  const out: Row[] = [];

  const run = async (label: string, detail: string, fn: (tx: Client) => Promise<string>) => {
    await c.query("BEGIN");
    try {
      const r = await fn(c);
      await c.query("ROLLBACK");
      out.push({ item: label, result: "允许", detail: r || detail });
    } catch (e: any) {
      await c.query("ROLLBACK").catch(() => {});
      out.push({ item: label, result: `拒绝 ${e.code ?? ""}`.trim(), detail: String(e.message).split("\n")[0].slice(0, 80) });
    }
  };

  // 1) kv_app 无 DDL
  await run("kv_app 建表（应拒绝）", "", async (tx) => {
    await tx.query("SET LOCAL ROLE kv_app");
    await tx.query("CREATE TABLE should_not_exist (id int)");
    return "竟然建成功了";
  });

  // 2) kv_teacher 只能读视图
  await run("kv_teacher 读教师视图（应允许）", "", async (tx) => {
    await tx.query("SET LOCAL ROLE kv_teacher");
    const r = await tx.query("SELECT count(*)::int n FROM v_teacher_class_overview");
    return `视图行数 ${r.rows[0].n}`;
  });
  await run("kv_teacher 读 messages（应拒绝）", "", async (tx) => {
    await tx.query("SET LOCAL ROLE kv_teacher");
    await tx.query("SELECT count(*) FROM messages");
    return "竟然读到了";
  });

  // 3) REVOKE 立刻生效（事务内，回滚恢复）
  await run("对 kv_teacher REVOKE 视图后读取（应拒绝）", "", async (tx) => {
    await tx.query("REVOKE SELECT ON v_teacher_concept_heat FROM kv_teacher");
    await tx.query("SET LOCAL ROLE kv_teacher");
    await tx.query("SELECT count(*) FROM v_teacher_concept_heat");
    return "仍然可读";
  });

  // 4) WITH GRANT OPTION：转授
  await run("WITH GRANT OPTION 转授（应允许）", "", async (tx) => {
    await tx.query("CREATE ROLE kv_demo_reader NOLOGIN");
    await tx.query("GRANT USAGE ON SCHEMA public TO kv_demo_reader");
    await tx.query("GRANT SELECT ON v_teacher_class_overview TO kv_teacher WITH GRANT OPTION");
    await tx.query("SET LOCAL ROLE kv_teacher");
    await tx.query("GRANT SELECT ON v_teacher_class_overview TO kv_demo_reader");
    await tx.query("SET LOCAL ROLE kv_demo_reader");
    const r = await tx.query("SELECT count(*)::int n FROM v_teacher_class_overview");
    return `转授后 kv_demo_reader 读到 ${r.rows[0].n} 行`;
  });

  // 5) 列级权限
  await run("列级授权：只读 concepts(id,name)（应允许）", "", async (tx) => {
    await tx.query("CREATE ROLE kv_demo_col NOLOGIN");
    await tx.query("GRANT USAGE ON SCHEMA public TO kv_demo_col");
    await tx.query("GRANT SELECT (id, name) ON concepts TO kv_demo_col");
    await tx.query("SET LOCAL ROLE kv_demo_col");
    const r = await tx.query("SELECT name FROM concepts LIMIT 1");
    return `读到 ${r.rows[0].name}`;
  });
  await run("列级授权：SELECT * 访问未授权列（应拒绝）", "", async (tx) => {
    await tx.query("CREATE ROLE kv_demo_col2 NOLOGIN");
    await tx.query("GRANT USAGE ON SCHEMA public TO kv_demo_col2");
    await tx.query("GRANT SELECT (id, name) ON concepts TO kv_demo_col2");
    await tx.query("SET LOCAL ROLE kv_demo_col2");
    await tx.query("SELECT * FROM concepts LIMIT 1");
    return "竟然读到了全部列";
  });

  // 汇总
  console.log("\n授权与视图机制演示\n");
  for (const r of out) console.log(`${r.result.padEnd(10)} ${r.item}\n           ${r.detail}`);
  const denied = out.filter((r) => r.result.startsWith("拒绝")).length;
  console.log(`\n${out.length} 项检查：${denied} 项按预期被拒绝。`);

  const md = [
    "# 授权与视图机制演示（第 4 章）",
    "",
    "> 由 `npm run demo:grants` 生成；全部在事务内完成并回滚，不改变实际权限。",
    "",
    "| 操作 | 结果 | 说明 |",
    "|---|---|---|",
    ...out.map((r) => `| ${r.item} | ${r.result} | ${r.detail} |`),
    "",
    "## 对应课堂知识点",
    "",
    "- **自主存取控制（DAC）**：`GRANT`/`REVOKE`、`WITH GRANT OPTION`、角色。本项目运行时角色 `kv_app` 无 DDL；教师角色 `kv_teacher` 只有视图的 SELECT。",
    "- **视图机制**：教师子模式（`v_teacher_class_overview`、`v_teacher_concept_heat`）只暴露聚合，不暴露学生个人内容；角色只被授予视图，底层表不可见。",
    "- **列级授权**：`GRANT SELECT (id, name) ON concepts` 后，`SELECT *` 会因为缺少其他列权限被拒绝——说明 PostgreSQL 的权限粒度到列。",
    "- **审计**：与 `audit_log`（按月分区）配合，敏感表变更可追溯；`npm run security:audit` 可复核角色属性与 RLS 覆盖。",
  ].join("\n");
  const fs = await import("node:fs");
  fs.writeFileSync("docs/sql/grants-demo.md", md + "\n", "utf8");
  console.log("✓ 已写入 docs/sql/grants-demo.md");
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
