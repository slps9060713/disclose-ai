import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, policySchema } from "../../src/policy/schema.js";

describe("policySchema", () => {
  it("fills every default from a bare version", () => {
    const p = policySchema.parse({ version: 1 });
    expect(p.disclosure.required).toBe("when-detected");
    expect(p.disclosure.fields).toEqual(["tool", "extent"]);
    expect(p.disclosure.heading).toBe("AI Disclosure");
    expect(p.detection.signals).toHaveLength(5);
    expect(p.detection.min_confidence).toBe("medium");
    expect(p.enforcement.mode).toBe("comment+label");
    expect(p.enforcement.labels).toEqual({
      assisted: "ai-assisted",
      undisclosed: "ai-undisclosed",
    });
    expect(p.enforcement.exempt.bots).toContain("dependabot[bot]");
    expect(p.review.codex.enabled).toBe(false);
    expect(p.review.codex.min_changed_lines).toBe(20);
    expect(DEFAULT_POLICY).toEqual(p);
  });

  it("rejects version other than 1", () => {
    expect(policySchema.safeParse({ version: 2 }).success).toBe(false);
    expect(policySchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys and bad enums", () => {
    expect(policySchema.safeParse({ version: 1, typo: true }).success).toBe(false);
    expect(policySchema.safeParse({ version: 1, enforcement: { mode: "block" } }).success).toBe(
      false,
    );
    expect(policySchema.safeParse({ version: 1, detection: { signals: ["nope"] } }).success).toBe(
      false,
    );
  });

  it("keeps user overrides", () => {
    const p = policySchema.parse({
      version: 1,
      disclosure: { required: "always" },
      enforcement: { mode: "fail" },
    });
    expect(p.disclosure.required).toBe("always");
    expect(p.enforcement.mode).toBe("fail");
    expect(p.enforcement.comment_on_pass).toBe(false);
  });
});
