/**
 * 创建 SQL 练习沙箱：独立数据库 + 只读角色。
 * 角色 kv_sandbox 只能连接沙箱库，只拥有数据集 schema 的 SELECT 权限，默认只读事务与语句超时。
 * 业务库撤销 PUBLIC 的 CONNECT 权限，沙箱角色无法连接业务库。
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

function ident(s: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`非法标识符: ${s}`);
  return `"${s}"`;
}

export async function setupSandbox() {
  const sandboxUrl = process.env.SANDBOX_DATABASE_URL;
  const adminUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!sandboxUrl || !adminUrl) throw new Error("SANDBOX_DATABASE_URL / ADMIN_DATABASE_URL 未配置");
  const su = new URL(sandboxUrl);
  const role = decodeURIComponent(su.username);
  const pw = decodeURIComponent(su.password);
  const dbName = su.pathname.replace(/^\//, "");
  const businessDb = new URL(process.env.DATABASE_URL!).pathname.replace(/^\//, "");

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const r = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  // 角色名与库名经过白名单校验后才拼入 DDL（DDL 不支持参数占位符）；密码使用 format('%L') 由服务端转义
  if (r.rowCount === 0) {
    const { rows } = await admin.query("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS ddl", [role, pw]);
    await admin.query(rows[0].ddl);
  }
  await admin.query(`ALTER ROLE ${ident(role)} SET default_transaction_read_only = on`);
  await admin.query(`ALTER ROLE ${ident(role)} SET statement_timeout = '2000ms'`);
  const d = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (d.rowCount === 0) await admin.query(`CREATE DATABASE ${ident(dbName)}`);
  // 沙箱角色不能连接业务库
  await admin.query(`REVOKE CONNECT ON DATABASE ${ident(businessDb)} FROM PUBLIC`);
  await admin.query(`REVOKE ALL ON DATABASE ${ident(businessDb)} FROM ${ident(role)}`);
  await admin.end();

  const sb = new Client({ connectionString: adminUrl.replace(/\/[^/?]*(\?|$)/, `/${dbName}$1`) });
  await sb.connect();
  await sb.query(fs.readFileSync(path.join(process.cwd(), "sandbox", "datasets.sql"), "utf8"));
  await sb.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  for (const schema of ["school_v1"]) {
    await sb.query(`GRANT USAGE ON SCHEMA ${ident(schema)} TO ${ident(role)}`);
    await sb.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${ident(schema)} TO ${ident(role)}`);
  }
  await sb.end();
  console.log(`✓ SQL 沙箱就绪：数据库 ${dbName}，只读角色 ${role}，数据集 school_v1`);
}
