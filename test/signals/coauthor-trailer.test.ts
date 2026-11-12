import { describe, expect, it } from "vitest";
import { detectCoauthorTrailer } from "../../src/signals/coauthor-trailer.js";
import { makeCommit, makeCtx } from "../helpers/ctx.js";
import { loadFixture } from "../helpers/fixtures.js";

describe("detectCoauthorTrailer", () => {
  it("detects Claude Code trailer with high confidence", () => {
    const s = detectCoauthorTrailer(loadFixture("claude-code-trailer"));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      id: "coauthor-trailer",
      tool: "claude",
      confidence: "high",
      source: { kind: "commit" },
    });
    expect(s[0]?.evidence).toContain("a1a1a1a");
    expect(s[0]?.evidence).toContain("Co-authored-by: Claude <noreply@anthropic.com>");
  });

  it("detects Copilot and Cursor trailers", () => {
    expect(detectCoauthorTrailer(loadFixture("copilot-bot"))[0]?.tool).toBe("copilot");
    expect(detectCoauthorTrailer(loadFixture("cursor-trailer"))[0]?.tool).toBe("cursor");
  });

  it("requires both name and openai.com email for Codex", () => {
    const yes = makeCtx({
      commits: [makeCommit({ message: "x\n\nCo-authored-by: Codex <codex@openai.com>" })],
    });
    const no = makeCtx({
      commits: [makeCommit({ message: "x\n\nCo-authored-by: Codex Fan <fan@example.com>" })],
    });
    expect(detectCoauthorTrailer(yes)[0]?.tool).toBe("codex");
    expect(detectCoauthorTrailer(no)).toEqual([]);
  });

  it("ignores human co-authors and commits without trailers", () => {
    const ctx = makeCtx({
      commits: [makeCommit({ message: "x\n\nCo-authored-by: Ada <ada@example.com>" })],
    });
    expect(detectCoauthorTrailer(ctx)).toEqual([]);
    expect(detectCoauthorTrailer(loadFixture("human"))).toEqual([]);
    expect(detectCoauthorTrailer(loadFixture("codex-cloud-branch"))).toEqual([]);
  });

  it("emits one signal per matching commit", () => {
    const c = makeCommit({ message: "x\n\nCo-authored-by: Claude <noreply@anthropic.com>" });
    const ctx = makeCtx({ commits: [c, { ...c, sha: "b".repeat(40) }] });
    expect(detectCoauthorTrailer(ctx)).toHaveLength(2);
  });
});
