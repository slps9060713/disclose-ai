import { describe, expect, it } from "vitest";
import { detectBranchPrefix } from "../../src/signals/branch-prefix.js";
import { makeCtx } from "../helpers/ctx.js";
import { loadFixture } from "../helpers/fixtures.js";

describe("detectBranchPrefix", () => {
  it("detects codex/ with medium confidence", () => {
    const s = detectBranchPrefix(loadFixture("codex-cloud-branch"));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      id: "branch-prefix",
      tool: "codex",
      confidence: "medium",
      source: { kind: "branch", ref: "codex/add-retry-logic" },
    });
  });

  it("flags a human claude/ branch too (policy decides what to do)", () => {
    expect(detectBranchPrefix(loadFixture("human-claude-branch"))[0]?.tool).toBe("claude");
  });

  it("is case-insensitive and needs the slash", () => {
    expect(detectBranchPrefix(makeCtx({ headRef: "Cursor/feature" }))[0]?.tool).toBe("cursor");
    expect(detectBranchPrefix(makeCtx({ headRef: "codex-feature" }))).toEqual([]);
    expect(detectBranchPrefix(loadFixture("human"))).toEqual([]);
  });
});
