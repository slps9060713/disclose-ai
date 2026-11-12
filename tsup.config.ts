import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/main": "src/cli/main.ts",
    "action/index": "src/action/index.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: { entry: { index: "src/index.ts" } },
  noExternal: [/.*/],
  // Bundled CJS dependencies (e.g. yaml) call Node's real `require` for built-ins such as
  // "process" from inside their own module bodies. esbuild's CJS-interop shim falls back to that
  // ambient `require`, which does not exist in ESM output, so without this banner any such call
  // throws "Dynamic require of ... is not supported" -- not caught by any existing test because it
  // only surfaces when the bundle actually runs (as the CLI does), not when it is merely imported
  // and its individual exports are unit-tested against source files. A real `require`, scoped to
  // this file via `createRequire`, makes those calls resolve normally.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
});
