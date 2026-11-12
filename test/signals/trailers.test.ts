import { describe, expect, it } from "vitest";
import { parsePerson, parseTrailers } from "../../src/signals/trailers.js";

describe("parseTrailers", () => {
  it("finds Key: value lines anywhere in the message", () => {
    const t = parseTrailers(
      "feat: x\n\nSome body.\n\nCo-authored-by: A <a@x.io>\r\nSigned-off-by: B <b@x.io>",
    );
    expect(t).toEqual([
      { key: "feat", value: "x" },
      { key: "Co-authored-by", value: "A <a@x.io>" },
      { key: "Signed-off-by", value: "B <b@x.io>" },
    ]);
  });

  it("returns empty for no trailers", () => {
    expect(parseTrailers("just a subject")).toEqual([]);
  });
});

describe("parsePerson", () => {
  it("splits name and email", () => {
    expect(parsePerson("Claude <noreply@anthropic.com>")).toEqual({
      name: "Claude",
      email: "noreply@anthropic.com",
    });
  });
  it("handles missing email", () => {
    expect(parsePerson("ChatGPT")).toEqual({ name: "ChatGPT", email: "" });
  });
});
