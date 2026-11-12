import { describe, expect, it } from "vitest";
import { CliError } from "../../src/cli/errors.js";
import { parsePullRef } from "../../src/cli/ref.js";

describe("parsePullRef", () => {
  it("parses owner/repo#N", () => {
    expect(parsePullRef("acme/widget#42")).toEqual({ owner: "acme", repo: "widget", number: 42 });
  });
  it("parses GitHub PR URLs, with trailing paths", () => {
    expect(parsePullRef("https://github.com/acme/widget/pull/7/files")).toEqual({
      owner: "acme",
      repo: "widget",
      number: 7,
    });
  });
  it("rejects garbage with exit code 2", () => {
    expect(() => parsePullRef("nope")).toThrow(CliError);
    try {
      parsePullRef("nope");
    } catch (e) {
      expect((e as CliError).exitCode).toBe(2);
    }
  });
});
