import type { PullRequestContext, Signal } from "../types.js";
import { COAUTHOR_IDENTITIES } from "./patterns.js";
import { parsePerson, parseTrailers } from "./trailers.js";

export function detectCoauthorTrailer(ctx: PullRequestContext): Signal[] {
  const out: Signal[] = [];
  for (const c of ctx.commits) {
    for (const t of parseTrailers(c.message)) {
      if (!/^co-authored-by$/i.test(t.key)) continue;
      const { name, email } = parsePerson(t.value);
      const identity = COAUTHOR_IDENTITIES.find((i) => i.test(name, email));
      if (!identity) continue;
      out.push({
        id: "coauthor-trailer",
        tool: identity.tool,
        confidence: "high",
        evidence: `commit ${c.sha.slice(0, 7)}: Co-authored-by: ${t.value}`,
        source: { kind: "commit", ref: c.sha },
      });
    }
  }
  return out;
}
