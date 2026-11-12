import { describe, expect, it } from "vitest";
import { decide, invalidPolicyVerdict } from "../../src/evaluate/decide.js";
import { parseDisclosure } from "../../src/evaluate/disclosure.js";
import { DEFAULT_POLICY, policySchema } from "../../src/policy/schema.js";
import {
  COMMENT_MARKER,
  type RenderOptions,
  renderComment,
  shouldComment,
} from "../../src/report/comment.js";
import { detectSignals } from "../../src/signals/index.js";
import type { PullRequestContext, TriageResult, Verdict } from "../../src/types.js";
import { loadFixture } from "../helpers/fixtures.js";

const opts: RenderOptions = {
  policyPath: ".github/ai-policy.yml",
  policySource: "file",
  projectUrl: "https://github.com/slps9060713/disclose-ai",
};
const verdictFor = (ctx: PullRequestContext, policy = DEFAULT_POLICY) =>
  decide({
    policy,
    ctx,
    signals: detectSignals(ctx, policy.detection),
    disclosure: parseDisclosure(ctx.body, policy.disclosure),
  });

const okTriage: TriageResult = {
  ok: true,
  data: {
    description_matches_diff: "partial",
    tests_included: false,
    risk_areas: ["auth"],
    suggested_review_depth: "deep",
    flags: ["large diff without tests"],
    summary: "Adds retry logic; description omits the config change.",
  },
};

const verdictWithEvidence = (evidence: string): Verdict => ({
  status: "pass",
  aiDetected: true,
  signals: [
    {
      id: "coauthor-trailer",
      tool: "claude",
      confidence: "high",
      evidence,
      source: { kind: "commit", ref: "abc1234" },
    },
  ],
  disclosure: { present: false, noAi: false, missingFields: [] },
  labelsToAdd: [],
  labelsToRemove: [],
  checklist: [],
  reasons: [],
});

describe("renderComment", () => {
  it("starts with the hidden marker", () => {
    expect(
      renderComment(verdictFor(loadFixture("human")), undefined, DEFAULT_POLICY, opts).startsWith(
        `${COMMENT_MARKER}\n`,
      ),
    ).toBe(true);
  });

  it("needs-disclosure: lists evidence, checklist and a copyable template", () => {
    const body = renderComment(
      verdictFor(loadFixture("claude-code-trailer")),
      undefined,
      DEFAULT_POLICY,
      opts,
    );
    expect(body).toContain("AI disclosure needed");
    expect(body).toContain("Co-authored-by: Claude <noreply@anthropic.com>");
    expect(body).toContain('- [ ] Add a "## AI Disclosure" section');
    expect(body).toContain("## AI Disclosure\nTool: \nExtent: ");
    expect(body).toContain("This is not a rejection");
    expect(body).toMatch(/Policy: `\.github\/ai-policy\.yml`/);
    expect(body).toMatchSnapshot();
  });

  it("pass with disclosure: thanks, no checklist", () => {
    const ctx = {
      ...loadFixture("cursor-trailer"),
      body: "## AI Disclosure\nTool: Cursor\nExtent: refactor",
    };
    const body = renderComment(verdictFor(ctx), undefined, DEFAULT_POLICY, opts);
    expect(body).toContain("disclosed, thank you");
    expect(body).not.toContain("- [ ]");
    expect(body).toMatchSnapshot();
  });

  it("invalid-policy: lists errors and the validate command", () => {
    const body = renderComment(
      invalidPolicyVerdict(["enforcement.mode: Invalid enum value"]),
      undefined,
      DEFAULT_POLICY,
      opts,
    );
    expect(body).toContain("could not read the policy file");
    expect(body).toContain("- enforcement.mode: Invalid enum value");
    expect(body).toContain("npx disclose-ai validate .github/ai-policy.yml");
  });

  it("defaults footer suggests init when no policy file", () => {
    const body = renderComment(
      verdictFor(loadFixture("claude-code-trailer")),
      undefined,
      DEFAULT_POLICY,
      { ...opts, policySource: "default" },
    );
    expect(body).toContain("npx disclose-ai init");
  });

  it("renders Codex triage when ok and a one-liner when unavailable", () => {
    const v = verdictFor(loadFixture("claude-code-trailer"));
    const ok = renderComment(v, okTriage, DEFAULT_POLICY, opts);
    expect(ok).toContain("Automated first-pass triage by Codex");
    expect(ok).toContain("Description matches diff: **partial**");
    expect(ok).toContain("Suggested review depth: **deep**");
    expect(ok).toContain("> Adds retry logic");
    expect(ok).toMatchSnapshot();
    const bad = renderComment(v, { ok: false, reason: "timeout after 180s" }, DEFAULT_POLICY, opts);
    expect(bad).toContain("Automated triage unavailable: timeout after 180s");
  });

  it("renders a skipped verdict with its own headline", () => {
    const skipped = { ...verdictFor(loadFixture("human")), status: "skipped" as const };
    const body = renderComment(skipped, undefined, DEFAULT_POLICY, opts);
    expect(body).toContain("disclose-ai skipped this pull request");
  });

  it("triage with tests included and no risk areas or flags omits those lines", () => {
    const v = verdictFor(loadFixture("claude-code-trailer"));
    const triage: TriageResult = {
      ok: true,
      data: {
        description_matches_diff: "yes",
        tests_included: true,
        risk_areas: [],
        suggested_review_depth: "skim",
        flags: [],
        summary: "Small, well-tested change.",
      },
    };
    const body = renderComment(v, triage, DEFAULT_POLICY, opts);
    expect(body).toContain("Tests included: **yes**");
    expect(body).not.toContain("Risk areas:");
    expect(body).not.toContain("Flags:");
  });
});

describe("renderComment sanitizes untrusted text", () => {
  it("collapses newlines in signal evidence so a forged heading cannot start a new block", () => {
    const evidence = "commit abc1234: Co-authored-by: claude\n\n### Approved\nrm -rf /";
    const body = renderComment(verdictWithEvidence(evidence), undefined, DEFAULT_POLICY, opts);
    expect(body).not.toContain("\n### Approved");
    const line = body.split("\n").find((l) => l.startsWith("- `coauthor-trailer`"));
    expect(line).toBeDefined();
    expect(line).toContain("### Approved");
    expect(line).toContain("rm -rf /");
  });

  it("neutralizes a forged comment marker inside signal evidence, counted by occurrence", () => {
    const evidence = `commit abc1234: Co-authored-by: claude${COMMENT_MARKER} <x@y.com>`;
    const body = renderComment(verdictWithEvidence(evidence), undefined, DEFAULT_POLICY, opts);
    const occurrences = body.split(COMMENT_MARKER).length - 1;
    expect(occurrences).toBe(1);
  });

  it("keeps a forged heading inside the triage blockquote", () => {
    const v = verdictFor(loadFixture("claude-code-trailer"));
    const triage: TriageResult = {
      ok: true,
      data: {
        description_matches_diff: "yes",
        tests_included: true,
        risk_areas: [],
        suggested_review_depth: "skim",
        flags: [],
        summary: "Adds retry logic\n### Approved",
      },
    };
    const body = renderComment(v, triage, DEFAULT_POLICY, opts);
    const lines = body.split("\n");
    const quoteLine = lines.find((l) => l.startsWith("> Adds retry logic"));
    expect(quoteLine).toBeDefined();
    expect(quoteLine).toContain("### Approved");
    expect(body).not.toContain("\n### Approved");
    expect(lines.some((l) => l.trim() === "### Approved")).toBe(false);
  });

  it("collapses newlines in an unavailable triage reason", () => {
    const v = verdictFor(loadFixture("claude-code-trailer"));
    const body = renderComment(
      v,
      { ok: false, reason: "timeout\n### Approved" },
      DEFAULT_POLICY,
      opts,
    );
    expect(body).not.toContain("\n### Approved");
    const line = body.split("\n").find((l) => l.startsWith("Automated triage unavailable:"));
    expect(line).toBeDefined();
    expect(line).toContain("### Approved");
  });
});

describe("shouldComment", () => {
  const withMode = (mode: "comment+label" | "label-only" | "fail", comment_on_pass = false) =>
    policySchema.parse({ version: 1, enforcement: { mode, comment_on_pass } });
  const needs = verdictFor(loadFixture("claude-code-trailer"));
  const pass = verdictFor(loadFixture("human"));

  it("comments on needs-disclosure and invalid-policy in comment modes", () => {
    expect(shouldComment(needs, withMode("comment+label"))).toBe(true);
    expect(shouldComment(needs, withMode("fail"))).toBe(true);
    expect(shouldComment(invalidPolicyVerdict(["x"]), withMode("comment+label"))).toBe(true);
  });
  it("never comments in label-only mode", () => {
    expect(shouldComment(needs, withMode("label-only"))).toBe(false);
  });
  it("comments on pass only when comment_on_pass", () => {
    expect(shouldComment(pass, withMode("comment+label"))).toBe(false);
    expect(shouldComment(pass, withMode("comment+label", true))).toBe(true);
  });
  it("never comments on skipped", () => {
    const skipped = { ...pass, status: "skipped" as const };
    expect(shouldComment(skipped, withMode("comment+label", true))).toBe(false);
  });
});
