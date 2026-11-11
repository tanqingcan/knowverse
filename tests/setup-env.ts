// 测试使用独立的测试库，绝不连接开发/演示库
import fs from "node:fs";
import path from "node:path";
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL ?? "").replace(/\/[^/?]+(\?|$)/, "/knowverse_test$1");
// 测试直接用数据库所有者连接（迁移/造数方便）；RLS 由 tests/security.test.ts 以 kv_app 角色单独验证
delete process.env.APP_DATABASE_URL;
process.env.KV_CONNECTION = "system";
process.env.LLM_MODE = "demo";
process.env.UPLOAD_DIR = "./storage/test-uploads";
