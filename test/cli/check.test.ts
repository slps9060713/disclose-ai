import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/index.js";
import type { GitHubApi } from "../../src/github/api.js";
import { createFakeApi, stateFromContext } from "../helpers/fake-api.js";
import { loadFixture } from "../helpers/fixtures.js";

function harness(api?: GitHubApi, ...tokenArg: [string | undefined] | []) {
  // A default parameter value is substituted for an explicit `undefined` argument just as it is
  // for an omitted one, so a `token: string | undefined = "t0k3n"` parameter could never produce
  // the "no token" case that harness(undefined, undefined) below is meant to exercise -- it always
  // fell back to "t0k3n" and made a real network call. A rest parameter distinguishes "not passed"
  // (tokenArg is []) from "passed as undefined" (tokenArg is [undefined]) so that case can actually
  // resolve to no token.
  const resolvedToken = tokenArg.length > 0 ? tokenArg[0] : "t0k3n";
  const out: string[] = [];
  const err: string[] = [];
  let exitCode = 0;
  const program = createProgram({
    cwd: process.cwd(),
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    setExitCode: (c) => {
      exitCode = c;
    },
    api,
    resolveToken: () => resolvedToken,
  });
  const run = (args: string[]) => program.parseAsync(args, { from: "user" });
  return { run, out: () => out.join(""), err: () => err.join(""), exitCode: () => exitCode };
}

// A cwd-scoped variant of harness() for exercising `init`/`validate` end to end through
// createProgram: unlike check, they touch the filesystem under `deps.cwd` rather than the network,
// so they need an isolated directory instead of a fake GitHub API.
function programIn(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode = 0;
  const program = createProgram({
    cwd,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    setExitCode: (c) => {
      exitCode = c;
    },
  });
  const run = (args: string[]) => program.parseAsync(args, { from: "user" });
  return { run, out: () => out.join(""), err: () => err.join(""), exitCode: () => exitCode };
}

describe("disclose-ai check", () => {
  it("dry-runs by default and prints a human summary", async () => {
    const { api, state } = createFakeApi(stateFromContext(loadFixture("claude-code-trailer")));
    const h = harness(api);
    await h.run(["check", "acme/widget#101"]);
    expect(h.out()).toMatch(/status: needs-disclosure/);
    expect(h.out()).toMatch(/dry run/i);
    expect(state.calls).not.toContain("createComment");
    expect(h.exitCode()).toBe(0);
  });

  it("--apply writes, --json prints machine output", async () => {
    const { api, state } = createFakeApi(stateFromContext(loadFixture("claude-code-trailer")));
    const h = harness(api);
    await h.run(["check", "https://github.com/acme/widget/pull/101", "--apply", "--json"]);
    const json = JSON.parse(h.out());
    expect(json.verdict.status).toBe("needs-disclosure");
    expect(json.commented).toBe("created");
    expect(state.comments).toHaveLength(1);
  });

  it("propagates exit code 1 in fail mode", async () => {
    const { api } = createFakeApi({
      ...stateFromContext(loadFixture("claude-code-trailer")),
      files: { "main:.github/ai-policy.yml": "version: 1\nenforcement:\n  mode: fail\n" },
    });
    const h = harness(api);
    await h.run(["check", "acme/widget#101"]);
    expect(h.exitCode()).toBe(1);
  });

  it("fails with exit 2 when no token can be resolved", async () => {
    const h = harness(undefined, undefined);
    await expect(h.run(["check", "acme/widget#1"])).rejects.toMatchObject({ exitCode: 2 });
  });

  it("falls back to the real resolveToken when CliDeps omits one", async () => {
    // createProgram does `deps.resolveToken ?? defaultResolveToken` -- every other test here
    // supplies its own resolveToken, so that `??` always takes its left side and the real one
    // (src/cli/token.ts) is never selected. Omitting it here exercises that fallback assignment.
    // An injected fake `api` means runCheck never actually has to call the resolved function, so
    // this stays hermetic regardless of the real environment's GITHUB_TOKEN/GH_TOKEN/gh state.
    const { api } = createFakeApi(stateFromContext(loadFixture("claude-code-trailer")));
    const out: string[] = [];
    let exitCode = 0;
    const program = createProgram({
      cwd: process.cwd(),
      stdout: (s) => out.push(s),
      stderr: () => {},
      setExitCode: (c) => {
        exitCode = c;
      },
      api,
    });
    await program.parseAsync(["check", "acme/widget#101"], { from: "user" });
    expect(out.join("")).toMatch(/status: needs-disclosure/);
    expect(exitCode).toBe(0);
  });
});

describe("program", () => {
  it("validate prints errors and sets exit 1", async () => {
    const h = harness();
    await expect(h.run(["validate", "definitely-missing.yml"])).rejects.toMatchObject({
      exitCode: 1,
    });
  });
  it("shows version", async () => {
    const h = harness();
    await expect(h.run(["--version"])).rejects.toMatchObject({ code: "commander.version" });
    expect(h.out()).toMatch(/\d+\.\d+\.\d+/);
  });

  // Neither `init` nor a successful `validate` is exercised by the "disclose-ai check" tests
  // above or by test/cli/init.test.ts and test/cli/validate.test.ts, which call runInit/runValidate
  // directly rather than through createProgram -- so the command wiring in src/cli/index.ts (option
  // parsing, the unknown-template guard, and the stdout messages) is otherwise untested.
  describe("init wiring", () => {
    let cwd: string;
    beforeEach(async () => {
      cwd = await mkdtemp(join(tmpdir(), "disclose-ai-program-"));
    });
    afterEach(async () => {
      await rm(cwd, { recursive: true, force: true });
    });

    it("writes the policy and prints the follow-up message", async () => {
      const p = programIn(cwd);
      await p.run(["init"]);
      expect(p.out()).toContain("wrote .github/ai-policy.yml\n");
      expect(p.out()).toContain("Contributors will be asked to disclose AI assistance");
      await expect(readFile(join(cwd, ".github/ai-policy.yml"), "utf8")).resolves.toContain(
        "required: when-detected",
      );
    });

    it("rejects an unknown --template with exit code 2", async () => {
      const p = programIn(cwd);
      await expect(p.run(["init", "--template", "nonsense"])).rejects.toMatchObject({
        exitCode: 2,
      });
      expect(p.out()).toBe("");
    });
  });

  describe("validate wiring", () => {
    let cwd: string;
    beforeEach(async () => {
      cwd = await mkdtemp(join(tmpdir(), "disclose-ai-program-"));
    });
    afterEach(async () => {
      await rm(cwd, { recursive: true, force: true });
    });

    it("prints '<path> is valid' and does not set an exit code on success", async () => {
      const p = programIn(cwd);
      await p.run(["init"]);
      await p.run(["validate"]);
      expect(p.out()).toContain(".github/ai-policy.yml is valid\n");
      expect(p.exitCode()).toBe(0);
    });

    it("prints policy errors to stderr and rejects with exit code 1 for an invalid file", async () => {
      await mkdir(join(cwd, ".github"), { recursive: true });
      await writeFile(
        join(cwd, ".github/ai-policy.yml"),
        "version: 1\nenforcement:\n  mode: block\n",
        "utf8",
      );
      const p = programIn(cwd);
      await expect(p.run(["validate"])).rejects.toMatchObject({ exitCode: 1 });
      expect(p.err()).toContain(".github/ai-policy.yml is invalid:");
      expect(p.err()).toMatch(/enforcement\.mode/);
    });
  });
});
