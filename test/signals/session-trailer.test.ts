import { describe, expect, it } from "vitest";
import { detectSessionTrailer } from "../../src/signals/session-trailer.js";
import { makeCommit, makeCtx } from "../helpers/ctx.js";
import { loadFixture } from "../helpers/fixtures.js";

describe("detectSessionTrailer", () => {
  it("detects Claude-Session-Id and attributes the tool from the key", () => {
    const s = detectSessionTrailer(loadFixture("session-trailer"));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "session-trailer", tool: "claude", confidence: "high" });
    expect(s[0]?.evidence).toContain("Claude-Session-Id");
  });

  it("falls back to unknown for a bare Session-Id", () => {
    const ctx = makeCtx({ commits: [makeCommit({ message: "x\n\nSession-Id: abc" })] });
    expect(detectSessionTrailer(ctx)[0]?.tool).toBe("unknown");
  });

  it("ignores unrelated trailers", () => {
    expect(detectSessionTrailer(loadFixture("human"))).toEqual([]);
    expect(detectSessionTrailer(loadFixture("claude-code-trailer"))).toEqual([]);
  });
});
