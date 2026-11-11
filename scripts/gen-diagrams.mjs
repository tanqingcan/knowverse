#!/usr/bin/env node
/**
 * 跨平台生成 E-R 图与关系模式图：
 *   - Windows 上通常只有 `python`，Linux/macOS 上通常是 `python3`；
 *   - 依次尝试，全部失败时给出可操作的提示。
 * 用法：npm run docs:diagrams
 */
import { spawnSync } from "node:child_process";

const scripts = ["docs/er/gen_er.py", "docs/schema/gen_schema.py"];
const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

function pick() {
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return null;
}

const py = pick();
if (!py) {
  console.error("未找到 Python。请安装 Python 3（并确保 python 或 python3 在 PATH 中）。");
  process.exit(1);
}

// gen_schema.py 通过 psql 读数据库目录；Windows 上通常没有 psql，此时只生成 E-R 图并给出提示
const hasPsql = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
const toRun = hasPsql ? scripts : [scripts[0]];
if (!hasPsql) {
  console.warn("! 未找到 psql，跳过 docs/schema/gen_schema.py（关系模式图）。");
  console.warn("  需要时：docker exec -i <pg容器> psql ... 或在装有 PostgreSQL 客户端的机器上运行该脚本。");
}

console.log(`使用 ${py} 生成图…`);
// Windows 控制台默认 GBK，脚本里的 ✓ 等字符会抛 UnicodeEncodeError；强制 UTF-8
const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
for (const s of toRun) {
  const r = spawnSync(py, [s], { stdio: "inherit", env });
  if (r.status !== 0) {
    console.error(`生成失败：${s}`);
    process.exit(r.status ?? 1);
  }
}
console.log("✓ 图已更新：docs/er/*、docs/schema/schema-*");
