/**
 * 应用角色与最小权限（幂等）
 *
 * 与 sandbox/setup.ts 同一模式：角色属于集群，授权按“正在迁移的库”执行。
 * - 角色名/密码来自 APP_DATABASE_URL；
 * - 显式禁止 SUPERUSER / BYPASSRLS / CREATEDB / CREATEROLE，保证 RLS 一定生效；
 * - 只授予 CONNECT + public schema 的 DML 与序列（不授予 DDL）。
 * 迁移脚本（npm run db:migrate）在应用完 migration 后调用本函数。
 */
import { Client } from "pg";

function ident(s: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`非法标识符: ${s}`);
  return `"${s}"`;
}

export async function setupAppRole() {
  const appUrl = process.env.APP_DATABASE_URL;
  if (!appUrl) {
    console.warn("! 未配置 APP_DATABASE_URL，跳过应用角色（应用将回退为 DATABASE_URL 连接，RLS 不生效）");
    return;
  }
  const au = new URL(appUrl);
  const role = decodeURIComponent(au.username);
  const password = decodeURIComponent(au.password);
  if (!role || !password) throw new Error("APP_DATABASE_URL 必须包含用户名与密码，例如 postgres://kv_app:kv_app_dev@localhost:5432/knowverse");

  // 正在迁移的目标库（测试库也走这里，所以授权按 DATABASE_URL 的库名）
  const targetDb = new URL(process.env.DATABASE_URL!).pathname.replace(/^\//, "");
  if (!targetDb) throw new Error("DATABASE_URL 缺少数据库名");

  const adminBase = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!;
  const adminUrl = adminBase.replace(/\/[^/?]*(\?|$)/, `/${targetDb}$1`);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    // 角色名与密码经 format(%I/%L) 由服务端转义；DDL 不支持参数占位符
    const ddlSql = exists.rowCount
      ? "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) AS ddl"
      : "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS ddl";
    const ddl = (await admin.query(ddlSql, [role, password])).rows[0].ddl as string;
    await admin.query(ddl);

    // 关键：不允许绕过 RLS
    await admin.query(`ALTER ROLE ${ident(role)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);

    await admin.query(`GRANT CONNECT ON DATABASE ${ident(targetDb)} TO ${ident(role)}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${ident(role)}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(role)}`);
    await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(role)}`);
    // 之后由迁移创建的新表/序列，自动继承同样的权限
    await admin.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ident(role)}`);
    await admin.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${ident(role)}`);
  } finally {
    await admin.end();
  }
  console.log(`✓ 应用角色就绪：${role}（NOSUPERUSER / NOBYPASSRLS，目标库 ${targetDb}）`);
}
