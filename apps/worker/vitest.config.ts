import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { decorator: { legacy: true } },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
