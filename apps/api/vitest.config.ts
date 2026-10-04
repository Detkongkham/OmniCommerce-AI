import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
