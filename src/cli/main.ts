#!/usr/bin/env node
import { CliError } from "./errors.js";
import { createProgram } from "./index.js";

let exitCode = 0;
const program = createProgram({
  cwd: process.cwd(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  setExitCode: (c) => {
    exitCode = c;
  },
});

try {
  await program.parseAsync(process.argv);
  process.exitCode = exitCode;
} catch (err) {
  if (err instanceof CliError) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = err.exitCode;
  } else if (
    typeof (err as { code?: unknown }).code === "string" &&
    String((err as { code: string }).code).startsWith("commander.")
  ) {
    process.exitCode = (err as { exitCode?: number }).exitCode ?? 1;
  } else {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  }
}
