import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "../../src/cli/errors.js";
import { runInit } from "../../src/cli/init.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "disclose-ai-"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("runInit", () => {
  it("writes the standard policy", async () => {
    const r = await runInit(cwd, { template: "standard", withWorkflow: false, force: false });
    expect(r.written).toEqual([".github/ai-policy.yml"]);
    const text = await readFile(join(cwd, ".github/ai-policy.yml"), "utf8");
    expect(text).toContain("required: when-detected");
    expect(text).toContain("mode: comment+label");
  });

  it("writes the workflow without any checkout step", async () => {
    const r = await runInit(cwd, { template: "strict", withWorkflow: true, force: false });
    expect(r.written).toEqual([".github/ai-policy.yml", ".github/workflows/disclose-ai.yml"]);
    const wf = await readFile(join(cwd, ".github/workflows/disclose-ai.yml"), "utf8");
    expect(wf).toContain("pull_request_target");
    expect(wf).toContain("types: [opened, synchronize, edited, reopened]");
    expect(wf).toContain("uses: slps9060713/disclose-ai@v1");
    expect(wf).not.toContain("actions/checkout");
    expect(wf).toContain("${{ secrets.OPENAI_API_KEY }}");
    expect(wf).toContain("concurrency:");
    expect(wf).toContain("group: disclose-ai-${{ github.event.pull_request.number }}");
    expect(wf).toContain("cancel-in-progress: true");
  });

  it("refuses to overwrite unless --force", async () => {
    await runInit(cwd, { template: "standard", withWorkflow: false, force: false });
    await expect(
      runInit(cwd, { template: "light", withWorkflow: false, force: false }),
    ).rejects.toThrow(CliError);
    await runInit(cwd, { template: "light", withWorkflow: false, force: true });
    expect(await readFile(join(cwd, ".github/ai-policy.yml"), "utf8")).toContain("label-only");
  });
});
