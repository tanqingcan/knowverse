import "./env";
import { Pool } from "pg";
// 仅用于本地开发：清空业务库 public schema 与 drizzle 迁移记录
async function main() {
  const url = process.env.DATABASE_URL!;
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("拒绝重置非本地数据库");
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await pool.end();
  console.log("✓ 已重置本地业务库");
}
main().catch((e) => { console.error(e); process.exit(1); });
