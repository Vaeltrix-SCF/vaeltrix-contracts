import { defineConfig } from "vitest/config";

// One root config so `pnpm test` runs every package and service suite (guide §3.4).
export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "services/*/test/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    passWithNoTests: true,
  },
});
