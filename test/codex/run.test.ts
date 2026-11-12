import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Exec, ExecResult } from "../../src/codex/exec.js";
import { CODEX_CLI_VERSION, runTriage } from "../../src/codex/run.js";
import { DEFAULT_POLICY, policySchema } from "../../src/policy/schema.js";
import { loadFixture } from "../helpers/fixtures.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/codex/${name}.json`, import.meta.url), "utf8");
const ctx = { ...loadFixture("claude-code-trailer"), diff: "diff --git a/x b/x\n+1\n" };
const enabled = policySchema.parse({
  version: 1,
  review: { codex: { enabled: true, timeout_seconds: 7 } },
});

/** Fake exec that records the call and writes `output` to the path after `-o`. */
function fakeExec(output: string | undefined, result: Partial<ExecResult> = {}) {
  const calls: Array<{
    cmd: string;
    args: string[];
    stdin: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
  }> = [];
  const exec: Exec = async (cmd, args, opts) => {
    calls.push({ cmd, args, stdin: opts.stdin, env: opts.env, timeoutMs: opts.timeoutMs });
    const outPath = args[args.indexOf("-o") + 1];
    if (output !== undefined && outPath) await writeFile(outPath, output);
    return { code: 0, stdout: "", stderr: "", timedOut: false, ...result };
  };
  return { exec, calls };
}

describe("runTriage", () => {
  it("runs codex exec with the safety flags and returns validated data", async () => {
    const { exec, calls } = fakeExec(fixture("ok"));
    process.env.DISCLOSE_AI_TEST_SECRET = "should-not-leak";
    const r = await runTriage(ctx, enabled, { exec, apiKey: "sk-test" });
    delete process.env.DISCLOSE_AI_TEST_SECRET;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.suggested_review_depth).toBe("standard");

    const call = calls[0];
    if (!call) throw new Error("exec not called");
    expect(call.cmd).toBe("npx");
    expect(call.args.slice(0, 4)).toEqual([
      "--yes",
      "--package",
      `@openai/codex@${CODEX_CLI_VERSION}`,
      "codex",
    ]);
    for (const flag of [
      "exec",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--ignore-rules",
      "--ignore-user-config",
      "--output-schema",
      "-o",
      "--cd",
      "-",
    ]) {
      expect(call.args).toContain(flag);
    }
    expect(call.args).not.toContain("--model");
    expect(call.stdin).toContain("Title: feat: add parser");
    expect(call.env.CODEX_API_KEY).toBe("sk-test");
    expect(call.env.DISCLOSE_AI_TEST_SECRET).toBeUndefined();
    expect(call.timeoutMs).toBe(7000);
  });

  it("passes --model when configured or overridden", async () => {
    const a = fakeExec(fixture("ok"));
    await runTriage(
      ctx,
      policySchema.parse({ version: 1, review: { codex: { enabled: true, model: "gpt-x-mini" } } }),
      { exec: a.exec, apiKey: "k" },
    );
    expect(a.calls[0]?.args).toContain("gpt-x-mini");
    const b = fakeExec(fixture("ok"));
    await runTriage(ctx, enabled, { exec: b.exec, apiKey: "k", model: "override" });
    expect(b.calls[0]?.args.slice(-3)).toEqual(["--model", "override", "-"]);
  });

  it("uses a pinned custom version when given", async () => {
    const { exec, calls } = fakeExec(fixture("ok"));
    await runTriage(ctx, enabled, { exec, apiKey: "k", codexVersion: "9.9.9" });
    expect(calls[0]?.args[2]).toBe("@openai/codex@9.9.9");
  });

  it("degrades on timeout, non-zero exit, missing output, invalid JSON and schema errors", async () => {
    expect(
      await runTriage(ctx, enabled, {
        exec: fakeExec(undefined, { timedOut: true }).exec,
        apiKey: "k",
      }),
    ).toEqual({ ok: false, reason: "timeout after 7s" });
    const nz = await runTriage(ctx, enabled, {
      exec: fakeExec(undefined, { code: 2, stderr: "boom\nreal error" }).exec,
      apiKey: "k",
    });
    expect(nz).toMatchObject({ ok: false });
    if (!nz.ok) expect(nz.reason).toMatch(/exited with 2: .*real error/);
    expect(await runTriage(ctx, enabled, { exec: fakeExec(undefined).exec, apiKey: "k" })).toEqual({
      ok: false,
      reason: "codex produced no output file",
    });
    expect(await runTriage(ctx, enabled, { exec: fakeExec("not json").exec, apiKey: "k" })).toEqual(
      {
        ok: false,
        reason: "codex output was not valid JSON",
      },
    );
    const bad = await runTriage(ctx, enabled, {
      exec: fakeExec(fixture("bad-enum")).exec,
      apiKey: "k",
    });
    if (!bad.ok) expect(bad.reason).toMatch(/failed schema validation/);
  });

  it("degrades when exec throws and when there is no diff", async () => {
    const throwing: Exec = async () => {
      throw new Error("spawn npx ENOENT");
    };
    expect(await runTriage(ctx, enabled, { exec: throwing, apiKey: "k" })).toEqual({
      ok: false,
      reason: "spawn npx ENOENT",
    });
    expect(
      await runTriage({ ...ctx, diff: undefined }, enabled, {
        exec: fakeExec(fixture("ok")).exec,
        apiKey: "k",
      }),
    ).toEqual({ ok: false, reason: "no diff available" });
  });

  it("cleans up its temp dir", async () => {
    let made = "";
    const mkTmpDir = async () => {
      made = await mkdtemp(join(tmpdir(), "disclose-ai-test-"));
      return made;
    };
    await runTriage(ctx, DEFAULT_POLICY, {
      exec: fakeExec(fixture("ok")).exec,
      apiKey: "k",
      mkTmpDir,
    });
    await expect(import("node:fs/promises").then((fs) => fs.access(made))).rejects.toThrow();
  });

  // The three tests below are not in the brief; they were added after `--coverage` showed
  // three genuinely reachable branches the brief's own tests never exercised.

  it("skips an allow-listed env var when it is not set in the parent process", async () => {
    const had = Object.hasOwn(process.env, "npm_config_cache");
    const prev = process.env.npm_config_cache;
    delete process.env.npm_config_cache;
    try {
      const { exec, calls } = fakeExec(fixture("ok"));
      await runTriage(ctx, enabled, { exec, apiKey: "k" });
      expect(calls[0]?.env.npm_config_cache).toBeUndefined();
    } finally {
      if (had) process.env.npm_config_cache = prev;
    }
  });

  it("falls back to a fixed message when a non-zero exit produced no stderr", async () => {
    const r = await runTriage(ctx, enabled, {
      exec: fakeExec(undefined, { code: 3, stderr: "" }).exec,
      apiKey: "k",
    });
    expect(r).toEqual({ ok: false, reason: "codex exited with 3: no stderr" });
  });

  it("stringifies a thrown non-Error value", async () => {
    const throwing: Exec = async () => {
      throw "boom string";
    };
    expect(await runTriage(ctx, enabled, { exec: throwing, apiKey: "k" })).toEqual({
      ok: false,
      reason: "boom string",
    });
  });

  // Code-review fix: `mkTmpDir` used to be awaited before the `try` block opened, so a rejection
  // (a restricted or full /tmp, a bad TMPDIR, a permissions problem) escaped runTriage's promise
  // instead of degrading to { ok: false }. Confirms the fix: the rejection is now caught and
  // turned into a normal result, and the `finally` cleanup no longer runs `rm(undefined, ...)`.
  it("degrades when creating the temp dir fails, instead of rejecting", async () => {
    const mkTmpDir = async (): Promise<string> => {
      throw new Error("EMFILE: too many open files, mkdtemp");
    };
    await expect(
      runTriage(ctx, enabled, { exec: fakeExec(fixture("ok")).exec, apiKey: "k", mkTmpDir }),
    ).resolves.toEqual({ ok: false, reason: "EMFILE: too many open files, mkdtemp" });
  });
});
