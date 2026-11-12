import type { Policy } from "../policy/schema.js";
import {
  CONFIDENCE_RANK,
  type Disclosure,
  type PullRequestContext,
  type Signal,
  type Verdict,
} from "../types.js";

export interface DecideInput {
  policy: Policy;
  signals: Signal[];
  disclosure: Disclosure;
  ctx: PullRequestContext;
}

export function invalidPolicyVerdict(errors: string[]): Verdict {
  // A fresh literal every call, not a shared module-level constant: invalidPolicyVerdict is
  // exported as public library API (src/index.ts), so a third-party consumer mutating one call's
  // result must not corrupt every later call in the same process. runGate also defensively clones
  // this, but that only protects runGate's own callers, not someone calling this function
  // directly.
  return {
    status: "invalid-policy",
    aiDetected: false,
    signals: [],
    disclosure: { present: false, noAi: false, missingFields: [] },
    labelsToAdd: [],
    labelsToRemove: [],
    checklist: [],
    reasons: errors.map((e) => `policy: ${e}`),
  };
}

export function planLabels(
  current: string[],
  names: Policy["enforcement"]["labels"],
  wantAssisted: boolean,
  wantUndisclosed: boolean,
): { add: string[]; remove: string[] } {
  const has = new Set(current);
  const add: string[] = [];
  const remove: string[] = [];
  const want = (name: string, wanted: boolean) => {
    if (wanted && !has.has(name)) add.push(name);
    if (!wanted && has.has(name)) remove.push(name);
  };
  want(names.assisted, wantAssisted);
  want(names.undisclosed, wantUndisclosed);
  return { add, remove };
}

export function buildChecklist(cfg: Policy["disclosure"], d: Disclosure): string[] {
  const items: string[] = [];
  if (!d.present) items.push(`Add a "## ${cfg.heading}" section to the pull request description.`);
  if (d.missingFields.includes("tool"))
    items.push("State the tool you used (for example Claude Code, Codex, Cursor, Copilot).");
  if (d.missingFields.includes("extent"))
    items.push(
      "State the extent: what the tool produced, and what you reviewed, changed and tested yourself.",
    );
  items.push(`If no AI tools were involved, write "${cfg.no_ai_phrase}" in that section instead.`);
  return items;
}

export function decide({ policy, signals, disclosure, ctx }: DecideInput): Verdict {
  const { exempt, labels } = policy.enforcement;
  if (exempt.users.includes(ctx.author.login) || exempt.bots.includes(ctx.author.login)) {
    return {
      status: "skipped",
      aiDetected: false,
      signals,
      disclosure,
      labelsToAdd: [],
      labelsToRemove: [],
      checklist: [],
      reasons: [`author ${ctx.author.login} is exempt by policy`],
    };
  }

  const min = CONFIDENCE_RANK[policy.detection.min_confidence];
  const strong = signals.filter((s) => CONFIDENCE_RANK[s.confidence] >= min);
  const aiDetected = strong.length > 0;
  const disclosed = disclosure.present && disclosure.missingFields.length === 0;

  const reasons: string[] = [];
  if (aiDetected)
    reasons.push(
      `${strong.length} AI signal(s) at or above ${policy.detection.min_confidence} confidence`,
    );
  else if (signals.length > 0)
    reasons.push(
      `${signals.length} weak signal(s) below ${policy.detection.min_confidence} confidence, ignored`,
    );
  else reasons.push("no AI signals detected");

  let status: Verdict["status"] = "pass";
  if (policy.disclosure.required === "when-detected" && aiDetected && !disclosed)
    status = "needs-disclosure";
  if (policy.disclosure.required === "always" && !disclosed) status = "needs-disclosure";

  if (status === "needs-disclosure") {
    reasons.push(
      disclosure.present
        ? `disclosure section is missing: ${disclosure.missingFields.join(", ")}`
        : "no disclosure section found",
    );
  } else if (disclosed) {
    reasons.push(disclosure.noAi ? "contributor states no AI tools were used" : "AI use disclosed");
    if (disclosure.noAi && aiDetected)
      reasons.push(
        "note: AI signals were detected although the contributor states no AI tools were used",
      );
  }

  const wantAssisted =
    status === "pass" && (aiDetected || (disclosure.present && !disclosure.noAi));
  const wantUndisclosed = status === "needs-disclosure";
  const { add, remove } = planLabels(ctx.labels, labels, wantAssisted, wantUndisclosed);

  return {
    status,
    aiDetected,
    signals,
    disclosure,
    labelsToAdd: add,
    labelsToRemove: remove,
    checklist: status === "needs-disclosure" ? buildChecklist(policy.disclosure, disclosure) : [],
    reasons,
  };
}
