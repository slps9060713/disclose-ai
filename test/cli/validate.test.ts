import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "../../src/cli/errors.js";
import { runValidate } from "../../src/cli/validate.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "disclose-ai-"));
  await mkdir(join(cwd, ".github"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("runValidate", () => {
  it("validates the default path", async () => {
    await writeFile(join(cwd, ".github/ai-policy.yml"), "version: 1\n");
    expect(await runValidate(cwd, undefined)).toEqual({ ok: true, path: ".github/ai-policy.yml" });
  });
  it("reports errors", async () => {
    await writeFile(join(cwd, "p.yml"), "version: 1\nenforcement:\n  mode: block\n");
    const r = await runValidate(cwd, "p.yml");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^enforcement\.mode/);
  });
  it("throws CliError when the file is missing", async () => {
    await expect(runValidate(cwd, "missing.yml")).rejects.toThrow(CliError);
  });
});
