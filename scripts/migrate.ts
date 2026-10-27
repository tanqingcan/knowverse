import "./env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { setupSandbox } from "../sandbox/setup";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ 业务库 migration 完成");
  await pool.end();
  try {
    await setupSandbox();
  } catch (e: any) {
    console.warn("! SQL 练习沙箱未能自动创建：", e.message);
    console.warn("  SQL 题将显示“沙箱未配置”。请参考 README 手动执行 sandbox/sandbox.sql。");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
