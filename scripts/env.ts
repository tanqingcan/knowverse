// 读取 .env（不引入额外依赖）
import fs from "node:fs";
import path from "node:path";
const p = path.resolve(process.cwd(), ".env");
if (fs.existsSync(p)) {
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

// 迁移、种子、重置等脚本一律使用 DATABASE_URL（表所有者，绕过行级安全）。
// APP_DATABASE_URL 只给 Next.js 运行时用；否则脚本会被它带到一个受 RLS 约束的连接上。
process.env.KV_CONNECTION = "system";
