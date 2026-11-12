import type { Policy } from "../policy/schema.js";
import type { TriageResult, Verdict } from "../types.js";

export const COMMENT_MARKER = "<!-- disclose-ai:v1 -->";
const FENCE = "`".repeat(3);

/**
 * Makes contributor- or model-controlled text safe to interpolate inline into the comment.
 * Collapses newlines so the text can never start a new Markdown block (a blockquote, a
 * heading, a fence), and neutralizes any forged occurrence of COMMENT_MARKER so untrusted
 * text can never plant the literal marker Task 9 looks for when finding its own comment.
 * Do not apply this to text the renderer itself authors, or to maintainer-controlled input
 * (policy.disclosure.heading, opts.policyPath).
 */
function sanitizeUntrusted(text: string): string {
  const singleLine = text.replace(/\r\n|\r|\n/g, " ");
  return singleLine.split(COMMENT_MARKER).join("[disclose-ai marker removed]");
}

/**
 * Wraps already-sanitized untrusted text in an inline code span so it renders as plain text
 * rather than live Markdown -- no links, no @mentions, no auto-linked bare emails. A backtick in
 * the value would otherwise close the span early (Markdown code spans have no backslash escape),
 * so backticks are replaced with a visually similar character first.
 */
function inlineCode(text: string): string {
  return `\`${text.replace(/`/g, "'")}\``;
}

export interface RenderOptions {
  policyPath: string;
  policySource: "file" | "default";
  projectUrl: string;
}

export function shouldComment(verdict: Verdict, policy: Policy): boolean {
  if (policy.enforcement.mode === "label-only") return false;
  switch (verdict.status) {
    case "needs-disclosure":
    case "invalid-policy":
      return true;
    case "pass":
      return policy.enforcement.comment_on_pass;
    case "skipped":
      return false;
  }
}

function headline(v: Verdict): string {
  switch (v.status) {
    case "needs-disclosure":
      return [
        "### 🤖 AI disclosure needed",
        "",
        "This repository asks contributors to disclose AI assistance. Signals suggest an AI coding tool was involved, and the pull request description does not yet include a complete disclosure. This is not a rejection.",
      ].join("\n");
    case "pass":
      return v.aiDetected || v.disclosure.present
        ? "### ✅ AI-assisted contribution disclosed, thank you"
        : "### ✅ No AI signals detected";
    case "invalid-policy":
      return "### ⚠️ disclose-ai could not read the policy file";
    case "skipped":
      return "### disclose-ai skipped this pull request";
  }
}

export function renderComment(
  verdict: Verdict,
  triage: TriageResult | undefined,
  policy: Policy,
  opts: RenderOptions,
): string {
  const out: string[] = [COMMENT_MARKER, "", headline(verdict), ""];

  if (verdict.signals.length > 0) {
    out.push("**What was detected**", "");
    for (const s of verdict.signals)
      out.push(
        `- \`${s.id}\` (${s.confidence}, ${s.tool}): ${inlineCode(sanitizeUntrusted(s.evidence))}`,
      );
    out.push("");
  }

  if (verdict.status === "needs-disclosure") {
    out.push("**What to do**", "");
    for (const item of verdict.checklist) out.push(`- [ ] ${item}`);
    out.push("", "Copy this into the pull request description and fill it in:", "");
    out.push(
      `${FENCE}markdown`,
      `## ${policy.disclosure.heading}`,
      "Tool: ",
      "Extent: ",
      FENCE,
      "",
    );
  }

  if (verdict.status === "invalid-policy") {
    out.push("**Policy file errors**", "");
    for (const r of verdict.reasons) out.push(`- ${r.replace(/^policy: /, "")}`);
    out.push(
      "",
      `Fix \`${opts.policyPath}\`, or run \`npx disclose-ai validate ${opts.policyPath}\` locally to see the same errors.`,
      "",
    );
  }

  if (triage) {
    out.push("**Automated first-pass triage by Codex**", "");
    if (triage.ok) {
      const d = triage.data;
      out.push(`- Description matches diff: **${d.description_matches_diff}**`);
      out.push(`- Tests included: **${d.tests_included ? "yes" : "no"}**`);
      out.push(`- Suggested review depth: **${d.suggested_review_depth}**`);
      if (d.risk_areas.length > 0)
        out.push(`- Risk areas: ${d.risk_areas.map(sanitizeUntrusted).join(", ")}`);
      if (d.flags.length > 0) out.push(`- Flags: ${d.flags.map(sanitizeUntrusted).join("; ")}`);
      out.push(
        "",
        `> ${sanitizeUntrusted(d.summary)}`,
        "",
        "_AI-generated triage for maintainers. It is not a review decision and never approves or merges._",
      );
    } else {
      out.push(`Automated triage unavailable: ${sanitizeUntrusted(triage.reason)}`);
    }
    out.push("");
  }

  const policyNote =
    opts.policySource === "file"
      ? `Policy: \`${opts.policyPath}\``
      : `Policy: defaults (no \`${opts.policyPath}\` found; run \`npx disclose-ai init\` to add one)`;
  out.push("---", "", `<sub>${policyNote} · Powered by [disclose-ai](${opts.projectUrl})</sub>`);
  return out.join("\n");
}
