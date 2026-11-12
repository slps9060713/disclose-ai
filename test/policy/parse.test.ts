import { describe, expect, it } from "vitest";
import { parsePolicy } from "../../src/policy/parse.js";

describe("parsePolicy", () => {
  it("returns defaults when no file", () => {
    const r = parsePolicy(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("default");
      expect(r.policy.enforcement.mode).toBe("comment+label");
    }
  });

  it("parses a partial YAML and fills defaults", () => {
    const r = parsePolicy("version: 1\ndisclosure:\n  required: always\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("file");
      expect(r.policy.disclosure.required).toBe("always");
      expect(r.policy.detection.signals).toHaveLength(5);
    }
  });

  it("reports schema errors with paths", () => {
    const r = parsePolicy("version: 1\nenforcement:\n  mode: block\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^enforcement\.mode: /);
  });

  it("reports missing version", () => {
    const r = parsePolicy("disclosure:\n  required: always\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/version/);
  });

  it("reports YAML syntax errors", () => {
    const r = parsePolicy("version: 1\ndisclosure: [unclosed\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^YAML parse error/);
  });

  it("treats an empty file as missing version", () => {
    const r = parsePolicy("");
    expect(r.ok).toBe(false);
  });
});
