import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...args),
}));

const { resolveToken } = await import("../../src/cli/token.js");

const ORIGINAL_GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORIGINAL_GH_TOKEN = process.env.GH_TOKEN;

function clearEnv() {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
}

function restoreEnv() {
  if (ORIGINAL_GITHUB_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = ORIGINAL_GITHUB_TOKEN;
  if (ORIGINAL_GH_TOKEN === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = ORIGINAL_GH_TOKEN;
}

beforeEach(() => {
  clearEnv();
  execFileSync.mockReset();
});
afterEach(() => {
  restoreEnv();
});

describe("resolveToken", () => {
  it("returns the explicit token without consulting the environment or gh", () => {
    process.env.GITHUB_TOKEN = "env-tok";
    expect(resolveToken("explicit-tok")).toBe("explicit-tok");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("falls back to GITHUB_TOKEN when no explicit token is given", () => {
    process.env.GITHUB_TOKEN = "gh-env-tok";
    expect(resolveToken(undefined)).toBe("gh-env-tok");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("falls back to GH_TOKEN when GITHUB_TOKEN is unset", () => {
    process.env.GH_TOKEN = "gh-alt-tok";
    expect(resolveToken()).toBe("gh-alt-tok");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("shells out to `gh auth token` when no explicit token or env var is set", () => {
    execFileSync.mockReturnValue("  cli-tok\n");
    expect(resolveToken()).toBe("cli-tok");
    expect(execFileSync).toHaveBeenCalledWith("gh", ["auth", "token"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
  });

  it("returns undefined when `gh auth token` prints nothing", () => {
    execFileSync.mockReturnValue("   ");
    expect(resolveToken()).toBeUndefined();
  });

  it("returns undefined when gh is missing or the command fails", () => {
    execFileSync.mockImplementation(() => {
      throw new Error("spawn gh ENOENT");
    });
    expect(resolveToken()).toBeUndefined();
  });
});
