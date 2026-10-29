import { defineConfig } from "vitest/config";
import path from "node:path";

/** 纯函数单测：不需要数据库与全局 setup（tests/global-setup.ts 会重置测试库）。 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
