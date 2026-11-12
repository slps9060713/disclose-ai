import { describe, expect, it } from "vitest";
import { runGate } from "../src/run.js";
import type { TriageResult } from "../src/types.js";
import { createFakeApi, stateFromContext } from "./helpers/fake-api.js";
import { loadFixture } from "./helpers/fixtures.js";

const ref = { owner: "acme", repo: "widget", number: 101 };
const POLICY = ".github/ai-policy.yml";
const policyFile = (yaml: string) => ({ files: { [`main:${POLICY}`]: yaml } });
const base = (fixture: string, extra: object = {}) =>
  createFakeApi({ ...stateFromContext(loadFixture(fixture)), ...extra });
const okTriage: TriageResult = {
  ok: true,
  data: {
    description_matches_diff: "yes",
    tests_included: true,
    risk_areas: [],
    suggested_review_depth: "skim",
    flags: [],
    summary: "Small safe change.",
  },
};

describe("runGate", () => {
  it("human PR, no policy file: pass, no writes, defaults", async () => {
    const { api, state } = base("human");
    const r = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r.verdict.status).toBe("pass");
    expect(r.policySource).toBe("default");
    expect(r.commented).toBe("skipped");
    expect(r.comment).toBeUndefined();
    expect(r.exitCode).toBe(0);
    expect(state.calls).not.toContain("createComment");
    expect(state.calls).not.toContain("addLabels");
  });

  it("AI PR without disclosure: comment created, label added, exit 0 by default", async () => {
    const { api, state } = base("claude-code-trailer");
    const r = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r.verdict.status).toBe("needs-disclosure");
    expect(r.commented).toBe("created");
    expect(r.labelsAdded).toEqual(["ai-undisclosed"]);
    expect(r.finalLabels).toEqual(["ai-undisclosed"]);
    expect(r.exitCode).toBe(0);
    expect(state.comments[0]?.body).toContain("AI disclosure needed");
    expect(state.comments[0]?.body).toContain("npx disclose-ai init");
  });

  it("fail mode from the policy file exits 1", async () => {
    const { api } = base(
      "claude-code-trailer",
      policyFile("version: 1\nenforcement:\n  mode: fail\n"),
    );
    const r = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r.policySource).toBe("file");
    expect(r.exitCode).toBe(1);
  });

  it("dry run renders the comment but never writes", async () => {
    const { api, state } = base("claude-code-trailer");
    const r = await runGate({ ref, policyPath: POLICY, apply: false }, { api });
    expect(r.comment).toContain("AI disclosure needed");
    expect(r.commented).toBe("skipped");
    expect(
      state.calls.filter((c) =>
        ["createComment", "updateComment", "addLabels", "removeLabel", "ensureLabel"].includes(c),
      ),
    ).toEqual([]);
  });

  it("invalid policy: posts errors, exit 0 with warning, exit 1 when mode override is fail", async () => {
    const yaml = "version: 1\nenforcement:\n  mode: block\n";
    const a = base("human", policyFile(yaml));
    const r1 = await runGate({ ref, policyPath: POLICY, apply: true }, { api: a.api });
    expect(r1.verdict.status).toBe("invalid-policy");
    expect(r1.policySource).toBe("invalid");
    expect(r1.policyErrors[0]).toMatch(/^enforcement\.mode/);
    expect(r1.commented).toBe("created");
    expect(r1.exitCode).toBe(0);
    expect(r1.warnings.join(" ")).toMatch(/invalid; defaults applied/);
    const b = base("human", policyFile(yaml));
    const r2 = await runGate(
      { ref, policyPath: POLICY, apply: true, modeOverride: "fail" },
      { api: b.api },
    );
    expect(r2.exitCode).toBe(1);
  });

  it("label-only policy labels without commenting", async () => {
    const { api, state } = base(
      "copilot-bot",
      policyFile("version: 1\nenforcement:\n  mode: label-only\n"),
    );
    const r = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r.commented).toBe("skipped");
    expect(state.labels.has("ai-undisclosed")).toBe(true);
  });

  it("exempt authors are skipped entirely", async () => {
    const ctx = {
      ...loadFixture("human"),
      author: { login: "dependabot[bot]", type: "Bot" as const },
    };
    const { api, state } = createFakeApi(stateFromContext(ctx));
    const r = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r.verdict.status).toBe("skipped");
    expect(state.calls).toEqual(["getPull", "listCommits", "getFileText"]);
  });

  it("runs Codex triage when enabled and the diff is large enough", async () => {
    const { api, state } = base(
      "claude-code-trailer",
      policyFile("version: 1\nreview:\n  codex:\n    enabled: true\n"),
    );
    let seenDiff: string | undefined;
    const r = await runGate(
      { ref, policyPath: POLICY, apply: true },
      {
        api,
        triage: async (ctx) => {
          seenDiff = ctx.diff;
          return okTriage;
        },
      },
    );
    expect(state.calls).toContain("getDiff");
    expect(seenDiff).toContain("diff --git");
    expect(r.triage).toEqual(okTriage);
    expect(state.comments[0]?.body).toContain("Automated first-pass triage by Codex");
  });

  it("skips Codex below min_changed_lines and degrades on triage errors", async () => {
    const small = { ...loadFixture("claude-code-trailer"), additions: 3, deletions: 1 };
    const a = createFakeApi({
      ...stateFromContext(small),
      files: { [`main:${POLICY}`]: "version: 1\nreview:\n  codex:\n    enabled: true\n" },
    });
    const r1 = await runGate(
      { ref, policyPath: POLICY, apply: false },
      { api: a.api, triage: async () => okTriage },
    );
    expect(a.state.calls).not.toContain("getDiff");
    expect(r1.triage).toBeUndefined();

    const b = base(
      "claude-code-trailer",
      policyFile("version: 1\nreview:\n  codex:\n    enabled: true\n"),
    );
    const r2 = await runGate(
      { ref, policyPath: POLICY, apply: false },
      {
        api: b.api,
        triage: async () => {
          throw new Error("codex exploded");
        },
      },
    );
    expect(r2.triage).toEqual({ ok: false, reason: "codex exploded" });
    expect(r2.comment).toContain("Automated triage unavailable: codex exploded");
  });

  it("codexEnabledOverride can force triage on and off", async () => {
    const on = base("claude-code-trailer");
    await runGate(
      { ref, policyPath: POLICY, apply: false, codexEnabledOverride: true },
      { api: on.api, triage: async () => okTriage },
    );
    expect(on.state.calls).toContain("getDiff");
    const off = base(
      "claude-code-trailer",
      policyFile("version: 1\nreview:\n  codex:\n    enabled: true\n"),
    );
    await runGate(
      { ref, policyPath: POLICY, apply: false, codexEnabledOverride: false },
      { api: off.api, triage: async () => okTriage },
    );
    expect(off.state.calls).not.toContain("getDiff");
  });

  it("comment failure becomes a warning and labels still sync", async () => {
    const { api, state } = base("claude-code-trailer", {
      failAlways: { createComment: new Error("403") },
    });
    const r = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r.commented).toBe("skipped");
    expect(r.warnings[0]).toMatch(/could not post comment: 403/);
    expect(state.labels.has("ai-undisclosed")).toBe(true);
  });

  // The triager is a directly injectable function, so a rejection that is not an Error
  // (e.g. a bare string, as a misbehaving triage client might throw) can be exercised
  // without touching test/helpers/fake-api.ts. This pins message()'s String(err) fallback,
  // the one branch every other test above only reaches with a real Error instance.
  it("stringifies a non-Error rejection from the triager", async () => {
    const { api } = base(
      "claude-code-trailer",
      policyFile("version: 1\nreview:\n  codex:\n    enabled: true\n"),
    );
    const r = await runGate(
      { ref, policyPath: POLICY, apply: false },
      {
        api,
        triage: async () => {
          throw "codex exploded (not an Error)";
        },
      },
    );
    expect(r.triage).toEqual({ ok: false, reason: "codex exploded (not an Error)" });
  });

  // No brief scenario ever gives ctx.labels a pre-existing label that verdict.labelsToRemove
  // then drops, so the filter in finalLabels' computation was never actually invoked (constraint
  // #4: finalLabels reflects removals from ctx.labels even in a dry run where nothing is written).
  // An inverted condition there would have shipped silently without this.
  it("finalLabels drops a label the verdict removes, even without writing", async () => {
    const ctx = {
      ...loadFixture("claude-code-trailer"),
      labels: ["ai-undisclosed"],
      body: "Adds the YAML parser.\n\n## AI Disclosure\nTool: Claude Code\nExtent: Generated the initial implementation; I reviewed and tested it.\n",
    };
    const { api, state } = createFakeApi(stateFromContext(ctx));
    const r = await runGate({ ref, policyPath: POLICY, apply: false }, { api });
    expect(r.verdict.status).toBe("pass");
    expect(r.verdict.labelsToAdd).toEqual(["ai-assisted"]);
    expect(r.verdict.labelsToRemove).toEqual(["ai-undisclosed"]);
    expect(r.finalLabels).toEqual(["ai-assisted"]);
    expect(state.calls).not.toContain("addLabels");
    expect(state.calls).not.toContain("removeLabel");
  });

  // parsePolicy(undefined) returns the DEFAULT_POLICY singleton itself, not a copy. If runGate
  // assigns it straight into GateResult, mutating one call's result.policy corrupts every later
  // call in-process that also falls back to defaults -- a defect that would surface as one PR
  // mysteriously judged under another's settings, and no other test here would catch it.
  it("does not leak the shared DEFAULT_POLICY singleton across calls", async () => {
    const first = base("human");
    const r1 = await runGate({ ref, policyPath: POLICY, apply: true }, { api: first.api });
    expect(r1.policySource).toBe("default");

    r1.policy.enforcement.mode = "fail";

    const second = base("human");
    const r2 = await runGate({ ref, policyPath: POLICY, apply: true }, { api: second.api });
    expect(r2.policy.enforcement.mode).toBe("comment+label");
  });

  // Same defect, different singleton: invalidPolicyVerdict() (src/evaluate/decide.ts) returns
  // disclosure: EMPTY_DISCLOSURE, a module-level constant. Mutating one call's verdict.disclosure
  // must not corrupt a later call that also hits an invalid policy file.
  it("does not leak the shared EMPTY_DISCLOSURE singleton across calls with an invalid policy", async () => {
    const yaml = "version: 1\nenforcement:\n  mode: block\n";
    const a = base("human", policyFile(yaml));
    const r1 = await runGate({ ref, policyPath: POLICY, apply: true }, { api: a.api });
    expect(r1.verdict.status).toBe("invalid-policy");

    r1.verdict.disclosure.missingFields.push("tool");

    const b = base("human", policyFile(yaml));
    const r2 = await runGate({ ref, policyPath: POLICY, apply: true }, { api: b.api });
    expect(r2.verdict.disclosure.missingFields).toEqual([]);
  });

  // BLOCKS MERGE (final whole-branch review): shouldComment() returns comment_on_pass (false by
  // default) for a "pass" verdict, so on the second event -- when the contributor edits the
  // description to add the disclosure -- runGate never called upsertComment. The label flipped
  // correctly but the comment was left saying "AI disclosure needed" beside a green check,
  // permanently. The fix: wantComment is true whenever a comment already exists, not only when
  // shouldComment says so.
  it("updates a stale needs-disclosure comment once the contributor adds a compliant disclosure", async () => {
    const { api, state } = base("claude-code-trailer");
    const r1 = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r1.verdict.status).toBe("needs-disclosure");
    expect(r1.commented).toBe("created");
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]?.body).toContain("AI disclosure needed");

    // The contributor edits the pull request description; the Action's own workflow re-runs on
    // `edited`. The real pull request would also gain the ai-undisclosed label from run 1, so
    // reflect that on the fake before the second call.
    state.pull.body =
      "Adds retry logic.\n\n## AI Disclosure\nTool: Claude Code\nExtent: generated the retry helper; I reviewed and tested it.\n";
    state.pull.labels = [{ name: "ai-undisclosed" }];

    const r2 = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r2.verdict.status).toBe("pass");
    expect(r2.commented).toBe("updated");
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]?.body).toContain("disclosed, thank you");
    expect(state.comments[0]?.body).not.toContain("AI disclosure needed");
    expect(r2.labelsAdded).toEqual(["ai-assisted"]);
    expect(r2.labelsRemoved).toEqual(["ai-undisclosed"]);
  });

  // Same staleness, different trigger: a force-push that strips the AI trailer entirely. The
  // verdict flips from needs-disclosure to a plain pass ("no AI signals detected"), and the stale
  // comment must follow.
  it("updates a stale needs-disclosure comment after a force-push removes the AI trailer", async () => {
    const { api, state } = base("claude-code-trailer");
    const r1 = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r1.commented).toBe("created");
    expect(state.comments[0]?.body).toContain("AI disclosure needed");

    state.commits = [
      {
        sha: "b".repeat(40),
        commit: { message: "feat: add parser", author: { name: "Dev", email: "dev@example.com" } },
        author: { login: "dev" },
      },
    ];

    const r2 = await runGate({ ref, policyPath: POLICY, apply: true }, { api });
    expect(r2.verdict.status).toBe("pass");
    expect(r2.verdict.aiDetected).toBe(false);
    expect(r2.commented).toBe("updated");
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]?.body).toContain("No AI signals detected");
    expect(state.comments[0]?.body).not.toContain("AI disclosure needed");
  });

  // Cross-task seam the review flagged: triage ran before and independently of whether a comment
  // would be posted, so a compliant pull request under comment_on_pass: false (this repository's
  // own configuration) paid for a Codex call whose result was rendered and then discarded. Gating
  // triage on the same wantComment flag means it is never invoked at all in that case.
  it("does not run Codex triage for a passing pull request that will not be commented on", async () => {
    const ctx = {
      ...loadFixture("claude-code-trailer"),
      body: "Adds the YAML parser.\n\n## AI Disclosure\nTool: Claude Code\nExtent: generated the initial implementation; I reviewed and tested it.\n",
    };
    const { api, state } = createFakeApi({
      ...stateFromContext(ctx),
      files: { [`main:${POLICY}`]: "version: 1\nreview:\n  codex:\n    enabled: true\n" },
    });
    let called = false;
    const r = await runGate(
      { ref, policyPath: POLICY, apply: true },
      {
        api,
        triage: async () => {
          called = true;
          return okTriage;
        },
      },
    );
    expect(r.verdict.status).toBe("pass");
    expect(r.commented).toBe("skipped");
    expect(called).toBe(false);
    expect(state.calls).not.toContain("getDiff");
  });
});
