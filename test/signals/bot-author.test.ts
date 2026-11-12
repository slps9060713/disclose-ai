import { describe, expect, it } from "vitest";
import { detectBotAuthor } from "../../src/signals/bot-author.js";
import { makeCommit, makeCtx } from "../helpers/ctx.js";
import { loadFixture } from "../helpers/fixtures.js";

describe("detectBotAuthor", () => {
  it("detects a known bot PR author once even if commits share the login", () => {
    const s = detectBotAuthor(loadFixture("copilot-bot"));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      id: "bot-author",
      tool: "copilot",
      confidence: "high",
      source: { kind: "author" },
    });
    expect(s[0]?.evidence).toContain("copilot-swe-agent[bot]");
  });

  it("detects Devin", () => {
    expect(detectBotAuthor(loadFixture("devin-bot"))[0]?.tool).toBe("devin");
  });

  it("infers the tool from an unknown Bot login by keyword", () => {
    const ctx = makeCtx({ author: { login: "cursor-agent-preview[bot]", type: "Bot" } });
    expect(detectBotAuthor(ctx)[0]?.tool).toBe("cursor");
  });

  it("ignores Bot logins without an agent keyword and human users", () => {
    expect(detectBotAuthor(makeCtx({ author: { login: "dependabot[bot]", type: "Bot" } }))).toEqual(
      [],
    );
    expect(detectBotAuthor(loadFixture("human"))).toEqual([]);
  });

  it("detects bot commit authors on a human PR", () => {
    const ctx = makeCtx({
      commits: [
        makeCommit({
          message: "x",
          author: { name: "Copilot", email: "c@x", login: "copilot-swe-agent[bot]" },
        }),
      ],
    });
    const s = detectBotAuthor(ctx);
    expect(s).toHaveLength(1);
    expect(s[0]?.source.kind).toBe("author");
    expect(s[0]?.evidence).toMatch(/^commit 0123456 authored by/);
  });

  it("skips a commit whose author has no login (e.g. an unlinked email)", () => {
    const ctx = makeCtx({
      commits: [
        makeCommit({ message: "x", author: { name: "Someone", email: "someone@example.com" } }),
      ],
    });
    expect(detectBotAuthor(ctx)).toEqual([]);
  });

  // BOT_LOGINS is a plain object; a naive `BOT_LOGINS[login]` lookup resolves logins that collide
  // with Object.prototype members to the inherited method itself (truthy), which would produce a
  // false high-confidence bot signal rendering as "function Object() { [native code] }".
  it("does not treat a login colliding with Object.prototype as a known bot", () => {
    expect(detectBotAuthor(makeCtx({ author: { login: "constructor", type: "User" } }))).toEqual(
      [],
    );
    expect(detectBotAuthor(makeCtx({ author: { login: "hasOwnProperty", type: "User" } }))).toEqual(
      [],
    );
    expect(detectBotAuthor(makeCtx({ author: { login: "toString", type: "User" } }))).toEqual([]);
  });
});
