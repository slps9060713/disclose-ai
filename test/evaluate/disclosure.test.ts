import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDisclosure } from "../../src/evaluate/disclosure.js";
import { DEFAULT_POLICY } from "../../src/policy/schema.js";

const cfg = DEFAULT_POLICY.disclosure;

describe("parseDisclosure", () => {
  it("parses a heading section with Tool and Extent", () => {
    const d = parseDisclosure(
      "Fixes #1\n\n## AI Disclosure\nTool: Claude Code\nExtent: drafted the parser; I reviewed and tested it\n\n## Testing\nnpm test",
      cfg,
    );
    expect(d).toMatchObject({
      present: true,
      noAi: false,
      tool: "Claude Code",
      extent: "drafted the parser; I reviewed and tested it",
      missingFields: [],
    });
    expect(d.raw).not.toContain("npm test");
  });

  it("accepts bold-label and bullet/bold field formats, case-insensitively", () => {
    const d = parseDisclosure(
      "**ai disclosure**\n- **Tool**: Cursor\n- **Extent**: autocomplete only",
      cfg,
    );
    expect(d).toMatchObject({
      present: true,
      tool: "Cursor",
      extent: "autocomplete only",
      missingFields: [],
    });
  });

  it("accepts a checkbox one-liner as the tool", () => {
    const d = parseDisclosure("- [x] AI Disclosure: Codex generated the tests", cfg);
    expect(d).toMatchObject({
      present: true,
      tool: "Codex generated the tests",
      missingFields: ["extent"],
    });
  });

  it("uses the first free line as the tool when no Tool label exists", () => {
    const d = parseDisclosure(
      "## AI Disclosure\nClaude Code\nExtent: everything, reviewed by me",
      cfg,
    );
    expect(d.tool).toBe("Claude Code");
    expect(d.missingFields).toEqual([]);
  });

  it("reports missing fields, including empty template values", () => {
    const d = parseDisclosure("## AI Disclosure\nTool: \nExtent: ", cfg);
    expect(d.present).toBe(true);
    expect(d.missingFields).toEqual(["tool", "extent"]);
  });

  it("treats the no-AI phrase inside the section as complete", () => {
    const d = parseDisclosure("## AI Disclosure\nNo AI tools were used.", cfg);
    expect(d).toMatchObject({ present: true, noAi: true, missingFields: [] });
  });

  it("treats the no-AI phrase anywhere in the body as a disclosure", () => {
    const d = parseDisclosure("Small fix. no ai tools were used here.", cfg);
    expect(d).toMatchObject({ present: true, noAi: true, missingFields: [] });
  });

  it("returns not present with all fields missing when nothing is found", () => {
    expect(parseDisclosure("Just a fix.", cfg)).toEqual({
      present: false,
      noAi: false,
      missingFields: ["tool", "extent"],
    });
    expect(parseDisclosure("", cfg).present).toBe(false);
  });

  it("handles CRLF bodies and custom headings", () => {
    const d = parseDisclosure("### Uso de IA\r\nTool: Gemini\r\nExtent: docs\r\n", {
      ...cfg,
      heading: "Uso de IA",
    });
    expect(d).toMatchObject({ present: true, tool: "Gemini", extent: "docs" });
  });

  it("only requires configured fields", () => {
    const d = parseDisclosure("## AI Disclosure\nTool: Copilot", { ...cfg, fields: ["tool"] });
    expect(d.missingFields).toEqual([]);
  });

  it("stops a bold-form disclosure at a blank line, excluding later prose", () => {
    const d = parseDisclosure(
      "**AI Disclosure**\nTool: Claude Code\nExtent: fixed a bug\n\nUnrelated prose that should not leak.\n\n## Testing\nnpm test",
      cfg,
    );
    expect(d).toMatchObject({ tool: "Claude Code", extent: "fixed a bug" });
    expect(d.raw).not.toContain("Unrelated prose");
  });

  it("does not report a labelled line as the tool when no Tool label exists", () => {
    const d = parseDisclosure("## AI Disclosure\nExtent: everything was written by hand", cfg);
    expect(d.tool).toBeUndefined();
    expect(d.missingFields).toContain("tool");
  });

  describe("HTML comments", () => {
    it("ignores the no-AI phrase when it only appears inside an instructional HTML comment", () => {
      const d = parseDisclosure(
        "## AI Disclosure\nTool: \nExtent: \n<!-- If AI tools were not used, replace the two lines above with: No AI tools were used -->",
        cfg,
      );
      expect(d).toMatchObject({ present: true, noAi: false, missingFields: ["tool", "extent"] });
    });

    it("ignores the no-AI phrase inside a comment when there is no heading section", () => {
      const d = parseDisclosure("Small fix.\n<!-- No AI tools were used -->", cfg);
      expect(d).toMatchObject({ present: false, noAi: false, missingFields: ["tool", "extent"] });
    });

    it("strips multiple separate comments in a section, keeping the real content between them", () => {
      const d = parseDisclosure(
        "## AI Disclosure\n<!-- first comment -->\nTool: Claude Code\nExtent: refactor\n<!-- second comment -->\n",
        cfg,
      );
      expect(d).toMatchObject({ tool: "Claude Code", extent: "refactor", missingFields: [] });
    });

    it("strips a comment that spans multiple lines rather than stopping at the first line", () => {
      const d = parseDisclosure(
        "## AI Disclosure\nTool: Claude Code\n<!--\nExtent: fake value hidden in a multi-line comment\n-->\nExtent: real value\n",
        cfg,
      );
      expect(d).toMatchObject({ tool: "Claude Code", extent: "real value", missingFields: [] });
    });

    it("does not use comment text as the free-line tool fallback", () => {
      const d = parseDisclosure("## AI Disclosure\n<!-- Claude Code -->\nExtent: docs only\n", cfg);
      expect(d.tool).toBeUndefined();
      expect(d.missingFields).toContain("tool");
    });

    it("treats an unterminated comment as consuming the rest of the text, like CommonMark HTML blocks", () => {
      const d = parseDisclosure(
        "## AI Disclosure\nTool: Claude Code\n<!-- Extent: unterminated, should vanish\nExtent: also gone",
        cfg,
      );
      expect(d.tool).toBe("Claude Code");
      expect(d.extent).toBeUndefined();
      expect(d.missingFields).toContain("extent");
    });

    it("does not detect the no-AI phrase written after an unterminated comment opener", () => {
      const d = parseDisclosure(
        "## AI Disclosure\nTool: \nExtent: \n<!-- No AI tools were used",
        cfg,
      );
      expect(d.noAi).toBe(false);
      expect(d.missingFields).toEqual(["tool", "extent"]);
    });

    it("parses the shipped PR template as an incomplete disclosure, not a no-AI declaration", () => {
      const url = new URL("../../.github/PULL_REQUEST_TEMPLATE.md", import.meta.url);
      const template = readFileSync(url, "utf8");
      const d = parseDisclosure(template, cfg);
      expect(d).toMatchObject({ present: true, noAi: false, missingFields: ["tool", "extent"] });
    });
  });

  // fieldValue's field-name regex used to start with a bare `\s*` under the multiline flag, which
  // lets `^` and `\s*` both range across a run of blank lines -- quadratic in the number of blank
  // lines (measured 8.4s for 60,000 blank lines on the pre-fix regex). Pull request bodies can
  // hold up to 65,536 characters, so a body that is mostly blank lines is a realistic input, not a
  // contrived one. This pins the fix: horizontal-whitespace-only at the start of the field regex,
  // mirroring the fix already applied after the colon.
  it("parses a body with a large run of blank lines quickly", () => {
    const blanks = "\n".repeat(60_000);
    const body = `## AI Disclosure${blanks}Tool: Claude Code\nExtent: refactor`;
    const start = Date.now();
    const d = parseDisclosure(body, cfg);
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(1000);
    expect(d).toMatchObject({ present: true, tool: "Claude Code", extent: "refactor" });
  });
});
