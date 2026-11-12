import { describe, expect, it } from "vitest";
import { formatCheckSummary } from "../../src/cli/format.js";
import { DEFAULT_POLICY } from "../../src/policy/schema.js";
import type { GateResult } from "../../src/run.js";
import type { PullRequestContext, Verdict } from "../../src/types.js";

// formatCheckSummary is a pure function of a GateResult, so every one of its branches can be
// exercised directly here even though runCheck (src/cli/check.ts) never actually produces some of
// them today -- e.g. it calls runGate without a `triage` dependency, so `r.triage` is always
// undefined on the real CLI path. That makes the codex-triage lines unreachable through the CLI as
// currently wired, but formatCheckSummary's own contract (documented by this test) still covers
// them, matching how a hand-built stub can exercise a branch that the full pipeline never reaches.

const baseCtx: PullRequestContext = {
  owner: "acme",
  repo: "widget",
  number: 101,
  title: "feat: add parser",
  body: "",
  author: { login: "dev", type: "User" },
  headRef: "feat/parser",
  baseRef: "main",
  commits: [],
  additions: 10,
  deletions: 2,
  changedFiles: 1,
  labels: [],
};

const baseVerdict: Verdict = {
  status: "pass",
  aiDetected: false,
  signals: [],
  disclosure: { present: false, noAi: false, missingFields: [] },
  labelsToAdd: [],
  labelsToRemove: [],
  checklist: [],
  reasons: [],
};

function makeResult(overrides: Partial<GateResult> = {}): GateResult {
  return {
    ctx: baseCtx,
    policy: DEFAULT_POLICY,
    policySource: "file",
    policyErrors: [],
    verdict: baseVerdict,
    triage: undefined,
    comment: undefined,
    commented: "skipped",
    labelsAdded: [],
    labelsRemoved: [],
    finalLabels: [],
    warnings: [],
    exitCode: 0,
    ...overrides,
  };
}

describe("formatCheckSummary", () => {
  it("marks the header dry run and reports AI detected: no when nothing was found", () => {
    const out = formatCheckSummary(makeResult(), false);
    expect(out).toContain("(dry run)");
    expect(out).toContain("AI detected: no (0 signal(s))");
  });

  it("marks the header apply and reports AI detected: yes with each signal listed", () => {
    const out = formatCheckSummary(
      makeResult({
        verdict: {
          ...baseVerdict,
          aiDetected: true,
          signals: [
            {
              id: "coauthor-trailer",
              tool: "claude",
              confidence: "high",
              evidence: "Co-authored-by: Claude",
              source: { kind: "commit", ref: "abc1234" },
            },
          ],
        },
      }),
      true,
    );
    expect(out).toContain("(apply)");
    expect(out).toContain("AI detected: yes (1 signal(s))");
    expect(out).toContain("  - coauthor-trailer [high, claude] Co-authored-by: Claude");
  });

  it("lists each reason on its own line", () => {
    const out = formatCheckSummary(
      makeResult({
        verdict: { ...baseVerdict, reasons: ["disclosure is missing required fields"] },
      }),
      false,
    );
    expect(out).toContain("  - disclosure is missing required fields");
  });

  it("reports the policy source verbatim when it is not the default", () => {
    const out = formatCheckSummary(makeResult({ policySource: "invalid" }), false);
    expect(out).toContain("policy: invalid");
  });

  it("reports 'defaults (no policy file)' when policySource is default", () => {
    // This is the state of every repository that has not yet adopted a policy file -- the single
    // most common case during first adoption -- so it needs its own explicit assertion rather than
    // relying on it merely being exercised incidentally by a fixture elsewhere.
    const out = formatCheckSummary(makeResult({ policySource: "default" }), false);
    expect(out).toContain("policy: defaults (no policy file)");
  });

  it("reports disclosure: no AI used when present and noAi", () => {
    const out = formatCheckSummary(
      makeResult({
        verdict: { ...baseVerdict, disclosure: { present: true, noAi: true, missingFields: [] } },
      }),
      false,
    );
    expect(out).toContain("disclosure: no AI used");
  });

  it("reports disclosure: tool=/extent= when present with details", () => {
    const out = formatCheckSummary(
      makeResult({
        verdict: {
          ...baseVerdict,
          disclosure: {
            present: true,
            noAi: false,
            tool: "claude",
            extent: "full",
            missingFields: [],
          },
        },
      }),
      false,
    );
    expect(out).toContain("disclosure: tool=claude extent=full");
  });

  it("falls back to ? for missing tool/extent when present without details", () => {
    const out = formatCheckSummary(
      makeResult({
        verdict: { ...baseVerdict, disclosure: { present: true, noAi: false, missingFields: [] } },
      }),
      false,
    );
    expect(out).toContain("disclosure: tool=? extent=?");
  });

  it("reports disclosure: none when absent", () => {
    const out = formatCheckSummary(makeResult(), false);
    expect(out).toContain("disclosure: none");
  });

  it("lists labels to remove with a - prefix", () => {
    const out = formatCheckSummary(
      makeResult({
        verdict: {
          ...baseVerdict,
          labelsToAdd: ["ai-disclosed"],
          labelsToRemove: ["needs-ai-disclosure"],
        },
      }),
      false,
    );
    expect(out).toContain("labels: +ai-disclosed -needs-ai-disclosure");
  });

  it("reports no label change when both lists are empty", () => {
    const out = formatCheckSummary(makeResult(), false);
    expect(out).toContain("labels: no change");
  });

  it("reports comment: none when no comment would be posted", () => {
    const out = formatCheckSummary(makeResult({ comment: undefined }), true);
    expect(out).toContain("comment: none");
  });

  it("reports comment: would be posted in dry-run mode", () => {
    const out = formatCheckSummary(makeResult({ comment: "hello" }), false);
    expect(out).toContain("comment: would be posted");
  });

  it("reports the actual commented outcome in apply mode", () => {
    const out = formatCheckSummary(makeResult({ comment: "hello", commented: "updated" }), true);
    expect(out).toContain("comment: updated");
  });

  it("reports codex triage depth when triage succeeded", () => {
    const out = formatCheckSummary(
      makeResult({
        triage: {
          ok: true,
          data: {
            description_matches_diff: "yes",
            tests_included: true,
            risk_areas: [],
            suggested_review_depth: "deep",
            flags: [],
            summary: "looks fine",
          },
        },
      }),
      false,
    );
    expect(out).toContain("codex triage: deep");
  });

  it("reports codex triage as unavailable with the reason when triage failed", () => {
    const out = formatCheckSummary(
      makeResult({ triage: { ok: false, reason: "timed out" } }),
      false,
    );
    expect(out).toContain("codex triage: unavailable (timed out)");
  });

  it("omits the codex triage line entirely when there is no triage", () => {
    const out = formatCheckSummary(makeResult({ triage: undefined }), false);
    expect(out).not.toContain("codex triage");
  });

  it("lists each warning on its own line", () => {
    const out = formatCheckSummary(
      makeResult({ warnings: ["could not post comment: boom"] }),
      true,
    );
    expect(out).toContain("warning: could not post comment: boom");
  });
});
