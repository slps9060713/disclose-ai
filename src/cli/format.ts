import type { GateResult } from "../run.js";

export function formatCheckSummary(r: GateResult, apply: boolean): string {
  const { ctx, verdict } = r;
  const lines = [
    `disclose-ai check for ${ctx.owner}/${ctx.repo}#${ctx.number} (${apply ? "apply" : "dry run"})`,
    `policy: ${r.policySource === "default" ? "defaults (no policy file)" : r.policySource}`,
    `status: ${verdict.status}`,
    `AI detected: ${verdict.aiDetected ? "yes" : "no"} (${verdict.signals.length} signal(s))`,
  ];
  for (const s of verdict.signals)
    lines.push(`  - ${s.id} [${s.confidence}, ${s.tool}] ${s.evidence}`);
  lines.push(
    `disclosure: ${verdict.disclosure.present ? (verdict.disclosure.noAi ? "no AI used" : `tool=${verdict.disclosure.tool ?? "?"} extent=${verdict.disclosure.extent ?? "?"}`) : "none"}`,
  );
  for (const reason of verdict.reasons) lines.push(`  - ${reason}`);
  const labels = [
    ...verdict.labelsToAdd.map((l) => `+${l}`),
    ...verdict.labelsToRemove.map((l) => `-${l}`),
  ];
  lines.push(`labels: ${labels.length ? labels.join(" ") : "no change"}`);
  lines.push(`comment: ${r.comment ? (apply ? r.commented : "would be posted") : "none"}`);
  if (r.triage)
    lines.push(
      `codex triage: ${r.triage.ok ? r.triage.data.suggested_review_depth : `unavailable (${r.triage.reason})`}`,
    );
  for (const w of r.warnings) lines.push(`warning: ${w}`);
  lines.push(`exit code: ${r.exitCode}`);
  return `${lines.join("\n")}\n`;
}
