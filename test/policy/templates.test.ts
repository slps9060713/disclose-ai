import { describe, expect, it } from "vitest";
import { parsePolicy } from "../../src/policy/parse.js";
import { getTemplate, TEMPLATE_NAMES } from "../../src/policy/templates.js";

describe("templates", () => {
  it("every template parses as a valid policy", () => {
    for (const name of TEMPLATE_NAMES) {
      const r = parsePolicy(getTemplate(name));
      expect(r.ok, `${name} should parse`).toBe(true);
    }
  });

  it("standard never blocks and requires disclosure only when detected", () => {
    const r = parsePolicy(getTemplate("standard"));
    if (!r.ok) throw new Error("bad template");
    expect(r.policy.disclosure.required).toBe("when-detected");
    expect(r.policy.enforcement.mode).toBe("comment+label");
  });

  it("strict requires disclosure always and fails the check", () => {
    const r = parsePolicy(getTemplate("strict"));
    if (!r.ok) throw new Error("bad template");
    expect(r.policy.disclosure.required).toBe("always");
    expect(r.policy.enforcement.mode).toBe("fail");
  });

  it("light only labels", () => {
    const r = parsePolicy(getTemplate("light"));
    if (!r.ok) throw new Error("bad template");
    expect(r.policy.enforcement.mode).toBe("label-only");
  });
});
