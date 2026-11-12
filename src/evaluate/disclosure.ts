import type { Policy } from "../policy/schema.js";
import type { Disclosure } from "../types.js";

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Field = "tool" | "extent";

// An HTML comment is invisible once the body is rendered as Markdown, so nothing inside one may
// influence the verdict -- not the no-AI phrase test, not field extraction, not the free-line
// fallback. Applied to the whole body (not just the extracted section) so the no-heading fallback
// below gets the same protection, and so a heading itself hidden inside a comment correctly stops
// being seen as a section rather than merely having its *content* sanitized afterward.
export function stripHtmlComments(text: string): string {
  // Well-formed comments: non-greedy and re-applied globally so "<!-- a --><!-- b -->" removes both
  // independently instead of one greedy match spanning from the first "<!--" to the last "-->".
  // [\s\S] (rather than .) matches newlines too, so a comment spanning multiple lines is removed
  // as a single unit.
  const closed = text.replace(/<!--[\s\S]*?-->/g, "");
  // An unterminated "<!--" has no matching "-->" left to pair with. CommonMark (and GitHub's
  // renderer) treats an HTML comment block with no closing marker as extending to the end of the
  // document, so strip it the same way -- otherwise leaving off the closing marker would be a way
  // to smuggle text past this sanitizer that a renderer would still hide.
  return closed.replace(/<!--[\s\S]*$/, "");
}

export function parseDisclosure(body: string, cfg: Policy["disclosure"]): Disclosure {
  const text = stripHtmlComments((body ?? "").replace(/\r\n/g, "\n"));
  const noAiRe = new RegExp(escapeRegExp(cfg.no_ai_phrase), "i");
  const section = extractSection(text, cfg.heading);

  if (section === undefined) {
    if (noAiRe.test(text)) return { present: true, noAi: true, missingFields: [] };
    return { present: false, noAi: false, missingFields: [...cfg.fields] };
  }

  const noAi = noAiRe.test(section);
  const tool = fieldValue(section, "tool") ?? firstFreeLine(section);
  const extent = fieldValue(section, "extent");
  const values: Record<Field, string | undefined> = { tool, extent };
  const missingFields = noAi ? [] : cfg.fields.filter((f) => !values[f]);
  return { present: true, noAi, tool, extent, missingFields, raw: section.trim() };
}

function extractSection(text: string, heading: string): string | undefined {
  const h = escapeRegExp(heading);
  const headingRe = new RegExp(`^#{1,6}\\s*${h}\\s*:?\\s*$`, "i");
  const boldRe = new RegExp(`^\\*\\*${h}\\*\\*\\s*:?\\s*(.*)$`, "i");
  const checkRe = new RegExp(`^[-*]\\s*\\[[xX]\\]\\s*${h}\\s*:?\\s*(.*)$`, "i");
  const isHeading = (l: string) => /^#{1,6}\s/.test(l);
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();

    if (headingRe.test(line)) {
      const buf: string[] = [];
      for (let j = i + 1; j < lines.length && !isHeading(lines[j] ?? ""); j++)
        buf.push(lines[j] ?? "");
      return buf.join("\n");
    }

    const bold = boldRe.exec(line);
    if (bold) {
      const buf: string[] = [bold[1] ?? ""];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j] ?? "";
        if (l.trim() === "" || isHeading(l)) break;
        buf.push(l);
      }
      return buf.join("\n");
    }

    const check = checkRe.exec(line);
    if (check) return check[1] ?? "";
  }
  return undefined;
}

const FIELD_LINE = /^\s*(?:[-*]\s*)?\*{0,2}\w+\*{0,2}\s*:/;

function fieldValue(section: string, field: Field): string | undefined {
  // Horizontal whitespace only on both sides of the field name: the post-colon spot was fixed
  // for correctness (\s* there would let a blank "Tool:" swallow the next line's "Extent:"), and
  // the leading spot is fixed here for performance -- a leading \s* under the multiline flag lets
  // "^" and "\s*" both match across a run of blank lines, which is quadratic in the number of
  // blank lines (measured 8.4s at 60,000 blank lines; pull request bodies can hold 65,536 chars).
  const re = new RegExp(
    `^[^\\S\\n]*(?:[-*]\\s*)?\\*{0,2}${field}\\*{0,2}\\s*:[^\\S\\n]*(.*?)\\s*$`,
    "im",
  );
  const v = re.exec(section)?.[1]?.trim();
  return v ? v : undefined;
}

function firstFreeLine(section: string): string | undefined {
  for (const raw of section.split("\n")) {
    const l = raw.trim();
    if (!l || FIELD_LINE.test(l)) continue;
    return l;
  }
  return undefined;
}
