import "./env";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { q } from "@/db";

/**
 * 安全自查（防御方视角）
 *
 * 检查项：
 *   1. 运行时角色：不是超级用户、不能绕过 RLS
 *   2. 行级安全：带 user_id 的表都启用策略（或已登记例外）
 *   3. 沙箱隔离：只读角色无法连接业务库
 *   4. 口令存储：全部是 scrypt 哈希，没有明文
 *   5. 仓库卫生：.env 未被跟踪
 *   6. SQL 拼接：列出所有在 SQL 模板里做插值的代码位置，供人工确认
 *
 * 用法：npm run security:audit（有失败项时退出码非 0）
 */

type Check = { id: string; title: string; ok: boolean; detail: string };
const results: Check[] = [];

const RLS_ALLOWLIST = [
  "auth_sessions", "planets", "learning_states", "class_members", "sharing_preferences",
  "learning_intents", "study_group_members", "contributions", "knowledge_cards",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
  // 1) 角色
  const role = decodeURIComponent(new URL(process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL!).username);
  const r = await q<{ rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`, [role]);
  results.push({
    id: "S1", title: `运行时角色 ${role} 不能绕过权限`,
    ok: r[0]?.rolsuper === false && r[0]?.rolbypassrls === false,
    detail: r[0] ? `rolsuper=${r[0].rolsuper}, rolbypassrls=${r[0].rolbypassrls}` : "角色不存在",
  });

  // 2) RLS 覆盖
  const missing = await q<{ relname: string }>(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col ON col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'user_id'
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
      AND NOT (c.relname = ANY($1::text[]))`, [RLS_ALLOWLIST]);
  results.push({
    id: "S2", title: "带 user_id 的表都启用行级安全（或已登记例外）",
    ok: missing.length === 0,
    detail: missing.length ? missing.map((m) => m.relname).join(", ") : "全部覆盖",
  });

  // 3) 沙箱角色不能连业务库
  const sandboxUrl = process.env.SANDBOX_DATABASE_URL;
  const bizDb = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  let sandboxBlocked = false;
  let sandboxDetail = "未配置 SANDBOX_DATABASE_URL，跳过";
  if (sandboxUrl) {
    const u = new URL(sandboxUrl);
    u.pathname = `/${bizDb}`;
    const c = new Client({ connectionString: u.toString() });
    try {
      await c.connect();
      await c.query("SELECT 1 FROM messages LIMIT 1");
      sandboxDetail = "沙箱角色竟然能读业务库！";
    } catch (e: any) {
      sandboxBlocked = /permission denied|拒绝|no pg_hba|does not exist/i.test(String(e.message));
      sandboxDetail = String(e.message).split("\n")[0];
    } finally {
      await c.end().catch(() => {});
    }
  }
  results.push({ id: "S3", title: "SQL 练习沙箱无法访问业务库", ok: sandboxBlocked, detail: sandboxDetail });

  // 4) 口令存储
  const badPw = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM users WHERE password_hash NOT LIKE 'scrypt$%'`);
  results.push({ id: "S4", title: "口令只存 scrypt 哈希", ok: badPw[0].n === 0, detail: `不合规 ${badPw[0].n} 行` });

  // 5) .env 未被 git 跟踪
  let tracked = "";
  try { tracked = execSync("git ls-files .env", { encoding: "utf8" }).trim(); } catch { /* 非 git 仓库 */ }
  results.push({ id: "S5", title: ".env 未进入版本库", ok: tracked === "", detail: tracked ? "仍被跟踪" : "未跟踪" });

  // 6) SQL 模板插值的位置（人工确认清单）
  const sites: string[] = [];
  for (const f of walk(path.resolve(process.cwd(), "src"))) {
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/(?:\bq1?|\.query)\(\s*`/.test(line) ) {
        // 找到模板字符串内的插值（可能跨行，做简单的前后 30 行窗口扫描）
        const window = lines.slice(i, i + 30).join("\n");
        const end = window.indexOf("`");
        const tpl = window.slice(0, window.indexOf("`", end + 1));
        if (tpl.includes("${")) sites.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      }
    });
  }
  results.push({
    id: "S6", title: "SQL 模板插值需人工确认（参数化或已转义）",
    ok: true,
    detail: sites.length
      ? `${sites.length} 处：` + [...new Set(sites)].map((s) => {
          if (s.includes("sandbox.ts")) return `${s}（SQL 练习沙箱：按设计执行用户 SELECT，只读事务 + 2s 超时 + 独立库）`;
          if (s.includes("materials.ts")) return `${s}（常量片段 VISIBLE，内含 $1 占位符，值仍参数化）`;
          return `${s}（需人工确认）`;
        }).join("；")
      : "无",
  });

  for (const c of results) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.id}  ${c.title}${c.id === "S6" ? "" : c.ok ? "" : `  ← ${c.detail}`}`);
    if (c.id === "S6" || !c.ok) console.log(`      ${c.detail}`);
  }
  const failed = results.filter((c) => !c.ok);
  console.log(`\n${results.length} 项安全检查：${failed.length} 项失败`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
