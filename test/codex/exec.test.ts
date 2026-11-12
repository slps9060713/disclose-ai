import { describe, expect, it } from "vitest";
import { defaultExec } from "../../src/codex/exec.js";

describe("defaultExec", () => {
  // Code-review fix: the only listener on the child was `child.on("error", ...)`, which covers
  // failures of the child process object itself, not of its stdio streams. If the child closes
  // its end of the stdin pipe before the parent finishes writing (exactly what happens when a
  // drifted CLI flag makes Codex exit immediately on startup -- the scenario our own manual-
  // verification doc names as the most likely production failure), the write fails with EPIPE on
  // a stream with no error listener. Node's default behavior for an unlistened 'error' event is
  // to throw it as an uncaught exception, which escapes the returned promise entirely and would
  // crash the whole Action process instead of letting `runTriage` degrade to { ok: false }.
  //
  // This cannot be reproduced through an injected `Exec` stub -- the defect lives inside
  // `defaultExec`'s own use of `node:child_process`, not in anything a caller controls. So this
  // test spawns a real, genuinely short-lived child process (`node -e "process.exit(0)"`) and
  // writes a payload larger than any OS pipe buffer so the write is still in flight when the
  // child exits. Confirmed manually before writing this test: reverting the `child.stdin.on(
  // "error", ...)` listener in src/codex/exec.ts reproduces an unhandled `Error: write EPIPE`
  // that crashes the process running this exact scenario; 5/5 runs with a 2 MB payload repro'd
  // it, so 8 MB here is a comfortable margin against a smaller pipe buffer in CI.
  it("does not crash when the child closes stdin before the write finishes", async () => {
    const bigPrompt = "x".repeat(8 * 1024 * 1024);
    const result = await defaultExec("node", ["-e", "process.exit(0)"], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 10_000,
      stdin: bigPrompt,
    });
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("stdin write failed");
  });
});
