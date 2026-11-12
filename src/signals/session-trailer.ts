import type { PullRequestContext, Signal } from "../types.js";
import { SESSION_TRAILER_KEY, toolFromText } from "./patterns.js";
import { parseTrailers } from "./trailers.js";

export function detectSessionTrailer(ctx: PullRequestContext): Signal[] {
  const out: Signal[] = [];
  for (const c of ctx.commits) {
    for (const t of parseTrailers(c.message)) {
      if (!SESSION_TRAILER_KEY.test(t.key)) continue;
      out.push({
        id: "session-trailer",
        tool: toolFromText(t.key),
        confidence: "high",
        evidence: `commit ${c.sha.slice(0, 7)}: ${t.key}: ${t.value}`,
        source: { kind: "commit", ref: c.sha },
      });
    }
  }
  return out;
}
