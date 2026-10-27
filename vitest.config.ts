import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
