import { decide, invalidPolicyVerdict } from "./evaluate/decide.js";
import { parseDisclosure } from "./evaluate/disclosure.js";
import type { GitHubApi, PullRef } from "./github/api.js";
import { fetchPolicyText, fetchPullRequestContext } from "./github/fetch.js";
import { findOwnComment, syncLabels, upsertComment } from "./github/write.js";
import { parsePolicy } from "./policy/parse.js";
import { DEFAULT_POLICY, type EnforcementMode, type Policy } from "./policy/schema.js";
import { renderComment, shouldComment } from "./report/comment.js";
import { detectSignals } from "./signals/index.js";
import type { PullRequestContext, TriageResult, Verdict } from "./types.js";

export const PROJECT_URL = "https://github.com/slps9060713/disclose-ai";

export type Triager = (ctx: PullRequestContext, policy: Policy) => Promise<TriageResult>;

export interface GateInputs {
  ref: PullRef;
  policyPath: string;
  apply: boolean;
  modeOverride?: EnforcementMode;
  codexEnabledOverride?: boolean;
  projectUrl?: string;
}

export interface GateDeps {
  api: GitHubApi;
  triage?: Triager;
  log?: (message: string) => void;
}

export interface GateResult {
  ctx: PullRequestContext;
  policy: Policy;
  policySource: "file" | "default" | "invalid";
  policyErrors: string[];
  verdict: Verdict;
  triage?: TriageResult;
  comment?: string;
  commented: "created" | "updated" | "skipped";
  labelsAdded: string[];
  labelsRemoved: string[];
  finalLabels: string[];
  warnings: string[];
  exitCode: 0 | 1;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function runGate(inputs: GateInputs, deps: GateDeps): Promise<GateResult> {
  const log = deps.log ?? (() => {});
  const warnings: string[] = [];
  const ctx = await fetchPullRequestContext(deps.api, inputs.ref);

  const parsed = parsePolicy(
    await fetchPolicyText(deps.api, inputs.ref, ctx.baseRef, inputs.policyPath),
  );
  // parsed.policy (the "no policy file" case) and the DEFAULT_POLICY fallback (the "invalid
  // policy file" case) both yield the same module-level singleton. Clone it so GateResult never
  // hands the caller a reference they could mutate and corrupt for every later call in-process.
  let policy: Policy = structuredClone(parsed.ok ? parsed.policy : DEFAULT_POLICY);
  const policySource: GateResult["policySource"] = parsed.ok ? parsed.source : "invalid";
  const policyErrors = parsed.ok ? [] : parsed.errors;
  if (inputs.modeOverride)
    policy = { ...policy, enforcement: { ...policy.enforcement, mode: inputs.modeOverride } };
  if (inputs.codexEnabledOverride !== undefined) {
    policy = {
      ...policy,
      review: { codex: { ...policy.review.codex, enabled: inputs.codexEnabledOverride } },
    };
  }

  // invalidPolicyVerdict() (Task 6, src/evaluate/decide.ts) returns disclosure: EMPTY_DISCLOSURE,
  // its own module-level singleton -- the same aliasing hazard as DEFAULT_POLICY above, just one
  // module over. decide()'s own result never aliases anything, so only this branch needs cloning.
  const verdict = parsed.ok
    ? decide({
        policy,
        ctx,
        signals: detectSignals(ctx, policy.detection),
        disclosure: parseDisclosure(ctx.body, policy.disclosure),
      })
    : structuredClone(invalidPolicyVerdict(policyErrors));
  log(`verdict: ${verdict.status} (${verdict.reasons.join("; ")})`);

  // Looked up once, before triage, so a stale comment gets updated even when the verdict alone
  // would not ask for one (shouldComment false): a contributor who complies after a
  // needs-disclosure comment, a force-push that removes the AI trailer, or a maintainer fixing an
  // invalid policy file must all still see their existing comment corrected, not left stale next
  // to a flipped label. Skipped (exempt-author) verdicts never had a comment and never get one.
  const existingComment =
    verdict.status === "skipped" ? undefined : await findOwnComment(deps.api, inputs.ref);
  const wantComment = shouldComment(verdict, policy) || existingComment !== undefined;

  let triage: TriageResult | undefined;
  const codex = policy.review.codex;
  // Gated on wantComment too: without it, a compliant pull request under a comment_on_pass:
  // false policy (this repository's own configuration) would still pay for a Codex call whose
  // result is rendered into a comment that is then discarded.
  if (wantComment && parsed.ok && codex.enabled && deps.triage && verdict.status !== "skipped") {
    if (ctx.additions + ctx.deletions < codex.min_changed_lines) {
      log(`codex triage skipped: fewer than ${codex.min_changed_lines} changed lines`);
    } else {
      try {
        ctx.diff = await deps.api.getDiff(inputs.ref);
        triage = await deps.triage(ctx, policy);
      } catch (err) {
        triage = { ok: false, reason: message(err) };
      }
    }
  }

  const comment = renderComment(verdict, triage, policy, {
    policyPath: inputs.policyPath,
    policySource: policySource === "default" ? "default" : "file",
    projectUrl: inputs.projectUrl ?? PROJECT_URL,
  });

  let commented: GateResult["commented"] = "skipped";
  let labelsAdded: string[] = [];
  let labelsRemoved: string[] = [];
  if (inputs.apply) {
    if (wantComment) {
      try {
        commented = await upsertComment(deps.api, inputs.ref, comment, {
          existing: existingComment,
        });
      } catch (err) {
        warnings.push(`could not post comment: ${message(err)}`);
      }
    }
    if (verdict.labelsToAdd.length > 0 || verdict.labelsToRemove.length > 0) {
      const r = await syncLabels(
        deps.api,
        inputs.ref,
        verdict.labelsToAdd,
        verdict.labelsToRemove,
        policy.enforcement.labels,
      );
      labelsAdded = r.added;
      labelsRemoved = r.removed;
      warnings.push(...r.warnings);
    }
  }

  const finalLabels = [
    ...new Set([
      ...ctx.labels.filter((l) => !verdict.labelsToRemove.includes(l)),
      ...verdict.labelsToAdd,
    ]),
  ];
  const failing = verdict.status === "needs-disclosure" || verdict.status === "invalid-policy";
  const exitCode: 0 | 1 = policy.enforcement.mode === "fail" && failing ? 1 : 0;
  if (policySource === "invalid" && exitCode === 0)
    warnings.push(`policy file ${inputs.policyPath} is invalid; defaults applied`);

  return {
    ctx,
    policy,
    policySource,
    policyErrors,
    verdict,
    triage,
    comment: wantComment ? comment : undefined,
    commented,
    labelsAdded,
    labelsRemoved,
    finalLabels,
    warnings,
    exitCode,
  };
}
