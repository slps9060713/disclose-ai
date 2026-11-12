import type { PullRequestContext, Signal, Tool } from "../types.js";
import { BRANCH_PREFIX } from "./patterns.js";

export function detectBranchPrefix(ctx: PullRequestContext): Signal[] {
  const m = BRANCH_PREFIX.exec(ctx.headRef);
  if (!m?.[1]) return [];
  const prefix = m[1].toLowerCase() as Tool;
  return [
    {
      id: "branch-prefix",
      tool: prefix,
      confidence: "medium",
      evidence: `branch "${ctx.headRef}" uses the agent prefix "${prefix}/"`,
      source: { kind: "branch", ref: ctx.headRef },
    },
  ];
}
