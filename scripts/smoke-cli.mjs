#!/usr/bin/env node
// Runs the built CLI (dist/cli/main.js) end to end and asserts it actually starts up and prints a
// version. `npm run check:dist` only diffs the committed dist/ bundle against a fresh build byte
// for byte -- it never executes the binary, so a dependency bump or a tsup.config.ts edit could
// silently reintroduce a broken bundle and every other automated check would still pass. This is
// exactly what happened during Task 11: as originally configured, the bundled `yaml` dependency's
// internal `require("process")` call had no working `require` in the ESM output, and
// `node dist/cli/main.js` crashed on every single invocation with
// "Dynamic require of ... is not supported" (fixed by the `banner` in tsup.config.ts that provides
// a real `require` via `createRequire(import.meta.url)`).
//
// This script depends on a built dist/, so it must run after `npm run build` (or `npm run
// check:dist`, which builds internally) -- not as part of the ordinary `npm test` unit suite,
// which must also pass on a fresh checkout before anything has been built.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "dist", "cli", "main.js");

function fail(reason) {
  console.error(`\nsmoke-cli FAILED: ${reason}`);
  console.error(
    "\nThis means the built CLI bundle (dist/cli/main.js) is broken -- not that the --version " +
      "flag itself changed. Reproduce locally with:\n" +
      "  npm run build && node dist/cli/main.js --version\n" +
      "and check tsup.config.ts's `banner` (it gives the bundle a working `require` for bundled " +
      "CommonJS dependencies that call Node's real require() internally, e.g. yaml). If that " +
      "banner was removed, or a new bundled dependency needs something else from the runtime " +
      "environment that the ESM bundle doesn't provide, that is almost certainly the cause.",
  );
  process.exitCode = 1;
}

let stdout;
try {
  stdout = execFileSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" });
} catch (err) {
  fail(`\`node dist/cli/main.js --version\` exited non-zero or crashed.\n${err.message}`);
  process.exit(process.exitCode);
}

const trimmed = stdout.trim();
if (!/^\d+\.\d+\.\d+/.test(trimmed)) {
  fail(`\`node dist/cli/main.js --version\` printed unexpected output: ${JSON.stringify(stdout)}`);
  process.exit(process.exitCode);
}

console.log(`smoke-cli: ok, dist/cli/main.js --version printed "${trimmed}"`);
