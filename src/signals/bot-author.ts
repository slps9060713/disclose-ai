import type { PullRequestContext, Signal } from "../types.js";
import { BOT_LOGINS, toolFromText } from "./patterns.js";

export function detectBotAuthor(ctx: PullRequestContext): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];

  const consider = (login: string | undefined, isBot: boolean, evidence: string, ref?: string) => {
    if (!login || seen.has(login)) return;
    // Object.hasOwn guards against a login literally named "constructor", "toString" or
    // "hasOwnProperty": a plain-object index would resolve those to an inherited Object.prototype
    // method (truthy), producing a false high-confidence bot signal that renders as
    // "function Object() { [native code] }" in the comment.
    const known = Object.hasOwn(BOT_LOGINS, login) ? BOT_LOGINS[login] : undefined;
    const tool = known ?? (isBot ? toolFromText(login) : "unknown");
    if (!known && (!isBot || tool === "unknown")) return;
    seen.add(login);
    out.push({
      id: "bot-author",
      tool,
      confidence: "high",
      evidence,
      source: { kind: "author", ref },
    });
  };

  consider(
    ctx.author.login,
    ctx.author.type === "Bot",
    `pull request opened by ${ctx.author.login}`,
  );
  for (const c of ctx.commits) {
    const login = c.author.login;
    consider(
      login,
      /\[bot\]$/.test(login ?? ""),
      `commit ${c.sha.slice(0, 7)} authored by ${login}`,
      c.sha,
    );
  }
  return out;
}
