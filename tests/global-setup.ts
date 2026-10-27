import { execSync } from "node:child_process";
import "./setup-env";

/** 每次测试前：重置测试库 → migration → 课程目录/资料/题库 seed（演示账号也会创建，但测试只用自建用户） */
export default function setup() {
  const env = { ...process.env };
  const url = env.DATABASE_URL!;
  if (!/knowverse_test/.test(url)) throw new Error("测试必须使用 knowverse_test 数据库");
  const run = (cmd: string) => execSync(cmd, { env, stdio: "pipe" });
  run("npx tsx scripts/reset.ts");
  run("npx tsx scripts/migrate.ts");
  run("npx tsx scripts/seed.ts");
}
