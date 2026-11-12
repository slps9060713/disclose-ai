import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/cli/main.ts", "src/action/index.ts", "src/codex/exec.ts", "src/github/api.ts"],
    },
  },
});
