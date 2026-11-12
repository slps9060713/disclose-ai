import type { Policy } from "../policy/schema.js";
import type { PullRequestContext, Signal, SignalId } from "../types.js";
import { detectBotAuthor } from "./bot-author.js";
import { detectBranchPrefix } from "./branch-prefix.js";
import { detectCoauthorTrailer } from "./coauthor-trailer.js";
import { detectCommitPattern } from "./commit-pattern.js";
import { detectSessionTrailer } from "./session-trailer.js";

type Detector = (ctx: PullRequestContext, detection: Policy["detection"]) => Signal[];

const DETECTORS: Record<SignalId, Detector> = {
  "coauthor-trailer": detectCoauthorTrailer,
  "branch-prefix": detectBranchPrefix,
  "bot-author": detectBotAuthor,
  "session-trailer": detectSessionTrailer,
  "commit-pattern": detectCommitPattern,
};

export function detectSignals(ctx: PullRequestContext, detection: Policy["detection"]): Signal[] {
  return detection.signals.flatMap((id) => DETECTORS[id](ctx, detection));
}
