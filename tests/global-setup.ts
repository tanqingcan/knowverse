import { execSync } from "node:child_process";
import { Client } from "pg";
import "./setup-env";

/** 每次测试前：重置测试库 → migration → 课程目录/资料/题库 seed（演示账号也会创建，但测试只用自建用户） */
export default async function setup() {
  const env = { ...process.env };
  // 首次 CI/本机运行也可工作；只创建固定测试库，绝不 reset 业务库。
  const target = new URL(env.DATABASE_URL!);
  const adminUrl = new URL(env.ADMIN_DATABASE_URL ?? target.href);
  if (adminUrl.hostname !== target.hostname || adminUrl.port !== target.port) throw new Error("测试管理员连接必须与测试库位于同一本机实例");
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.href });
  try {
    await admin.connect();
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'knowverse_test'")).rowCount) {
      await admin.query('CREATE DATABASE "knowverse_test"');
    }
  } finally { await admin.end(); }
  // 让 migrate 在测试库上也创建并授权应用角色（RLS 测试用 kv_app 连接）
  if (env.TEST_APP_DATABASE_URL) env.APP_DATABASE_URL = env.TEST_APP_DATABASE_URL;

  const run = (cmd: string) => execSync(cmd, { env, stdio: "pipe" });
  run("npx tsx scripts/reset.ts");
  run("npx tsx scripts/migrate.ts");
  run("npx tsx scripts/seed.ts");
}
