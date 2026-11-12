import type { Policy } from "../policy/schema.js";
import type { PullRequestContext, Signal, Tool } from "../types.js";
import { COMMIT_PATTERNS } from "./patterns.js";

export function compileCustomPatterns(list: string[]): Array<{ pattern: RegExp; tool: Tool }> {
  const out: Array<{ pattern: RegExp; tool: Tool }> = [];
  for (const source of list) {
    try {
      out.push({ pattern: new RegExp(source, "i"), tool: "unknown" });
    } catch {
      // invalid user regex: ignore, the policy validator reports it separately
    }
  }
  return out;
}

export function detectCommitPattern(
  ctx: PullRequestContext,
  detection: Policy["detection"],
): Signal[] {
  const patterns = [...COMMIT_PATTERNS, ...compileCustomPatterns(detection.custom_patterns)];
  const out: Signal[] = [];
  for (const c of ctx.commits) {
    const hit = patterns.find((p) => p.pattern.test(c.message));
    if (!hit) continue;
    out.push({
      id: "commit-pattern",
      tool: hit.tool,
      confidence: "medium",
      evidence: `commit ${c.sha.slice(0, 7)} matches ${hit.pattern}`,
      source: { kind: "commit", ref: c.sha },
    });
  }
  return out;
}
