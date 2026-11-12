import * as core from "@actions/core";
import * as github from "@actions/github";
import { defaultExec } from "../codex/exec.js";
import { runTriage } from "../codex/run.js";
import { createOctokitApi } from "../github/api.js";
import type { EnforcementMode } from "../policy/schema.js";
import { runGate, type Triager } from "../run.js";

const MODES = new Set<string>(["comment+label", "label-only", "fail"]);

async function main(): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.setFailed(
      "disclose-ai must run on pull_request_target (recommended) or pull_request events.",
    );
    return;
  }
  const repoFullName = github.context.payload.repository?.full_name;
  const headFullName = (pr as { head?: { repo?: { full_name?: string } } }).head?.repo?.full_name;
  if (
    github.context.eventName === "pull_request" &&
    headFullName &&
    repoFullName &&
    headFullName !== repoFullName
  ) {
    core.warning(
      "Fork pull request on the pull_request event: the token is read-only, so comments and labels will fail. Switch the workflow to pull_request_target.",
    );
  }

  const token = core.getInput("github-token", { required: true });
  const policyPath = core.getInput("policy-path") || ".github/ai-policy.yml";
  const modeInput = core.getInput("mode");
  if (modeInput && !MODES.has(modeInput)) {
    core.setFailed(`Invalid mode "${modeInput}". Use comment+label, label-only or fail.`);
    return;
  }
  const codexInput = core.getInput("codex-enabled");
  if (codexInput && codexInput !== "true" && codexInput !== "false") {
    core.setFailed(`Invalid codex-enabled "${codexInput}". Use true or false.`);
    return;
  }
  const apiKey = core.getInput("openai-api-key");
  const model = core.getInput("codex-model") || undefined;
  const dryRun = core.getBooleanInput("dry-run");

  const triage: Triager | undefined = apiKey
    ? (ctx, policy) => runTriage(ctx, policy, { exec: defaultExec, apiKey, model })
    : undefined;
  if (!apiKey && codexInput === "true")
    core.warning("codex-enabled is true but openai-api-key is empty; skipping Codex triage.");

  const result = await runGate(
    {
      ref: { owner: github.context.repo.owner, repo: github.context.repo.repo, number: pr.number },
      policyPath,
      apply: !dryRun,
      modeOverride: (modeInput || undefined) as EnforcementMode | undefined,
      codexEnabledOverride: codexInput === "" ? undefined : codexInput === "true",
    },
    { api: createOctokitApi(token), triage, log: (m) => core.info(m) },
  );

  core.setOutput("status", result.verdict.status);
  core.setOutput("detected", String(result.verdict.aiDetected));
  core.setOutput("signals", JSON.stringify(result.verdict.signals));
  core.setOutput("labels", result.finalLabels.join(","));
  for (const w of result.warnings) core.warning(w);
  core.info(
    `disclose-ai: ${result.verdict.status}; comment ${result.commented}; labels +[${result.labelsAdded.join(",")}] -[${result.labelsRemoved.join(",")}]`,
  );
  if (dryRun && result.comment) {
    core.startGroup("comment preview");
    core.info(result.comment);
    core.endGroup();
  }
  if (result.exitCode === 1)
    core.setFailed(`disclose-ai: ${result.verdict.status} (enforcement mode: fail)`);
}

main().catch((err: unknown) => core.setFailed(err instanceof Error ? err.message : String(err)));
