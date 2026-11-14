import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import "./setup-env";

/** 从 .env 读一个变量（setup-env 已把 APP_DATABASE_URL 从主测试进程移除，这里单独读给子进程用） */
function readDotEnv(key: string): string | undefined {
  const p = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(p)) return undefined;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
    if (m) return m[1].replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

/** 每次测试前：重置测试库 → migration → 课程目录/资料/题库 seed（演示账号也会创建，但测试只用自建用户） */
export default function setup() {
  const env = { ...process.env };
  const url = env.DATABASE_URL!;
  if (!/knowverse_test/.test(url)) throw new Error("测试必须使用 knowverse_test 数据库");

  // 让 migrate 在测试库上也创建并授权应用角色（RLS 测试用 kv_app 连接）
  const appUrl = readDotEnv("APP_DATABASE_URL");
  if (appUrl) env.APP_DATABASE_URL = appUrl.replace(/\/[^/?]+(\?|$)/, "/knowverse_test$1");
  env.TEST_APP_DATABASE_URL = env.APP_DATABASE_URL;

  const run = (cmd: string) => execSync(cmd, { env, stdio: "pipe" });
  run("npx tsx scripts/reset.ts");
  run("npx tsx scripts/migrate.ts");
  run("npx tsx scripts/seed.ts");
}
