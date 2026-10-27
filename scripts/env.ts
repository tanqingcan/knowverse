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
