import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "../../src/policy/schema.js";
import { compileCustomPatterns, detectCommitPattern } from "../../src/signals/commit-pattern.js";
import { makeCommit, makeCtx } from "../helpers/ctx.js";
import { loadFixture } from "../helpers/fixtures.js";

const detection = DEFAULT_POLICY.detection;

describe("detectCommitPattern", () => {
  it("detects aider with medium confidence", () => {
    const s = detectCommitPattern(loadFixture("aider-commit"), detection);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "commit-pattern", tool: "aider", confidence: "medium" });
  });

  it("emits at most one signal per commit", () => {
    const ctx = makeCtx({
      commits: [makeCommit({ message: "feat\n\n🤖 Generated with Claude Code" })],
    });
    expect(detectCommitPattern(ctx, detection)).toHaveLength(1);
  });

  it("applies custom patterns as unknown tool", () => {
    const ctx = makeCtx({ commits: [makeCommit({ message: "feat: x [ai-generated]" })] });
    const s = detectCommitPattern(ctx, { ...detection, custom_patterns: ["\\[ai-generated\\]"] });
    expect(s[0]?.tool).toBe("unknown");
  });

  it("ignores invalid custom regexes", () => {
    expect(compileCustomPatterns(["(", "ok"])).toHaveLength(1);
  });

  it("ignores human commits", () => {
    expect(detectCommitPattern(loadFixture("human"), detection)).toEqual([]);
  });
});
