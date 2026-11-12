import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  decide,
  invalidPolicyVerdict,
  planLabels,
} from "../../src/evaluate/decide.js";
import { parseDisclosure } from "../../src/evaluate/disclosure.js";
import { DEFAULT_POLICY, type Policy, policySchema } from "../../src/policy/schema.js";
import { detectSignals } from "../../src/signals/index.js";
import type { PullRequestContext } from "../../src/types.js";
import { makeCtx } from "../helpers/ctx.js";
import { loadFixture } from "../helpers/fixtures.js";

function run(ctx: PullRequestContext, policy: Policy = DEFAULT_POLICY) {
  return decide({
    policy,
    ctx,
    signals: detectSignals(ctx, policy.detection),
    disclosure: parseDisclosure(ctx.body, policy.disclosure),
  });
}
const withPolicy = (p: object) => policySchema.parse({ version: 1, ...p });

describe("decide: when-detected (default)", () => {
  it("detected + undisclosed -> needs-disclosure with undisclosed label", () => {
    const v = run(loadFixture("claude-code-trailer"));
    expect(v.status).toBe("needs-disclosure");
    expect(v.aiDetected).toBe(true);
    expect(v.labelsToAdd).toEqual(["ai-undisclosed"]);
    expect(v.checklist.length).toBeGreaterThan(0);
    expect(v.reasons.join(" ")).toMatch(/no disclosure section/);
  });

  it("detected + disclosed -> pass with assisted label", () => {
    const ctx = {
      ...loadFixture("claude-code-trailer"),
      body: "## AI Disclosure\nTool: Claude Code\nExtent: all of it, reviewed by me",
    };
    const v = run(ctx);
    expect(v.status).toBe("pass");
    expect(v.labelsToAdd).toEqual(["ai-assisted"]);
    expect(v.checklist).toEqual([]);
  });

  it("detected + partial disclosure -> needs-disclosure listing missing fields", () => {
    const ctx = {
      ...loadFixture("claude-code-trailer"),
      body: "## AI Disclosure\nTool: Claude Code",
    };
    const v = run(ctx);
    expect(v.status).toBe("needs-disclosure");
    expect(v.reasons.join(" ")).toMatch(/missing: extent/);
    expect(v.checklist.some((c) => /extent/i.test(c))).toBe(true);
    expect(v.checklist.some((c) => /Add a "## AI Disclosure"/.test(c))).toBe(false);
  });

  it("not detected + voluntary disclosure -> pass with assisted label", () => {
    const v = run({
      ...loadFixture("human"),
      body: "## AI Disclosure\nTool: Copilot\nExtent: autocomplete",
    });
    expect(v.status).toBe("pass");
    expect(v.labelsToAdd).toEqual(["ai-assisted"]);
  });

  it("not detected + no disclosure -> pass with no labels", () => {
    const v = run(loadFixture("human"));
    expect(v).toMatchObject({
      status: "pass",
      aiDetected: false,
      labelsToAdd: [],
      labelsToRemove: [],
    });
    expect(v.reasons).toContain("no AI signals detected");
  });

  it("a human claude/ branch that states no AI passes, labelled assisted because a signal fired", () => {
    const v = run(loadFixture("human-claude-branch"));
    expect(v.status).toBe("pass");
    expect(v.aiDetected).toBe(true);
    expect(v.labelsToAdd).toEqual(["ai-assisted"]);
    expect(v.reasons.join(" ")).toMatch(/states no AI tools were used/);
  });

  it("min_confidence high ignores the medium branch signal", () => {
    const v = run(
      loadFixture("codex-cloud-branch"),
      withPolicy({ detection: { min_confidence: "high" } }),
    );
    expect(v).toMatchObject({ status: "pass", aiDetected: false, labelsToAdd: [] });
    expect(v.reasons.join(" ")).toMatch(/weak signal/);
  });
});

describe("decide: always", () => {
  const always = withPolicy({ disclosure: { required: "always" } });
  it("human PR without disclosure -> needs-disclosure", () => {
    expect(run(loadFixture("human"), always).status).toBe("needs-disclosure");
  });
  it("human PR stating no AI -> pass without assisted label", () => {
    const v = run(
      { ...loadFixture("human"), body: "## AI Disclosure\nNo AI tools were used" },
      always,
    );
    expect(v).toMatchObject({ status: "pass", labelsToAdd: [] });
  });
  it("detected + disclosed -> pass with assisted label", () => {
    const v = run(
      {
        ...loadFixture("cursor-trailer"),
        body: "## AI Disclosure\nTool: Cursor\nExtent: refactor",
      },
      always,
    );
    expect(v).toMatchObject({ status: "pass", labelsToAdd: ["ai-assisted"] });
  });
});

describe("decide: never", () => {
  const never = withPolicy({ disclosure: { required: "never" } });
  it("detected -> pass but still labels assisted", () => {
    expect(run(loadFixture("copilot-bot"), never)).toMatchObject({
      status: "pass",
      labelsToAdd: ["ai-assisted"],
    });
  });
  it("human -> pass, nothing", () => {
    expect(run(loadFixture("human"), never)).toMatchObject({ status: "pass", labelsToAdd: [] });
  });
});

describe("decide: exemptions and labels", () => {
  it("skips exempt bots without touching labels", () => {
    const ctx = makeCtx({
      author: { login: "dependabot[bot]", type: "Bot" },
      labels: ["ai-undisclosed"],
    });
    const v = run(ctx);
    expect(v).toMatchObject({ status: "skipped", labelsToAdd: [], labelsToRemove: [] });
    expect(v.reasons[0]).toMatch(/exempt/);
  });

  it("skips exempt users", () => {
    const v = run(
      makeCtx({ author: { login: "octocat", type: "User" } }),
      withPolicy({ enforcement: { exempt: { users: ["octocat"] } } }),
    );
    expect(v.status).toBe("skipped");
  });

  it("removes a stale undisclosed label once disclosure arrives", () => {
    const ctx = {
      ...loadFixture("claude-code-trailer"),
      labels: ["ai-undisclosed"],
      body: "## AI Disclosure\nTool: Claude Code\nExtent: everything",
    };
    const v = run(ctx);
    expect(v.labelsToAdd).toEqual(["ai-assisted"]);
    expect(v.labelsToRemove).toEqual(["ai-undisclosed"]);
  });

  it("uses custom label names", () => {
    const v = run(
      loadFixture("claude-code-trailer"),
      withPolicy({ enforcement: { labels: { undisclosed: "needs-ai-note" } } }),
    );
    expect(v.labelsToAdd).toEqual(["needs-ai-note"]);
  });

  it("planLabels is idempotent", () => {
    const names = DEFAULT_POLICY.enforcement.labels;
    expect(planLabels(["ai-assisted"], names, true, false)).toEqual({ add: [], remove: [] });
    expect(planLabels(["ai-assisted", "ai-undisclosed"], names, false, false)).toEqual({
      add: [],
      remove: ["ai-assisted", "ai-undisclosed"],
    });
  });
});

describe("helpers", () => {
  it("buildChecklist only lists missing fields", () => {
    const items = buildChecklist(DEFAULT_POLICY.disclosure, {
      present: true,
      noAi: false,
      tool: "x",
      missingFields: ["extent"],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/extent/i);
    expect(items[1]).toMatch(/No AI tools were used/);
  });

  it("invalidPolicyVerdict carries the errors", () => {
    const v = invalidPolicyVerdict(["enforcement.mode: bad"]);
    expect(v.status).toBe("invalid-policy");
    expect(v.reasons).toEqual(["policy: enforcement.mode: bad"]);
    expect(v.labelsToAdd).toEqual([]);
  });
});
