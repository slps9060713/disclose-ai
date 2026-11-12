export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export type SignalId =
  | "coauthor-trailer"
  | "branch-prefix"
  | "bot-author"
  | "session-trailer"
  | "commit-pattern";

export type Tool =
  | "claude"
  | "codex"
  | "copilot"
  | "cursor"
  | "devin"
  | "gemini"
  | "aider"
  | "cline"
  | "jules"
  | "unknown";

export interface Commit {
  sha: string;
  message: string;
  author: { name: string; email: string; login?: string };
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: { login: string; type: "User" | "Bot" };
  headRef: string;
  baseRef: string;
  commits: Commit[];
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  diff?: string;
}

export interface Signal {
  id: SignalId;
  tool: Tool;
  confidence: Confidence;
  evidence: string;
  source: { kind: "commit" | "branch" | "author" | "body"; ref?: string };
}

export interface Disclosure {
  present: boolean;
  noAi: boolean;
  tool?: string;
  extent?: string;
  missingFields: string[];
  raw?: string;
}

export type VerdictStatus = "pass" | "needs-disclosure" | "skipped" | "invalid-policy";

export interface Verdict {
  status: VerdictStatus;
  aiDetected: boolean;
  signals: Signal[];
  disclosure: Disclosure;
  labelsToAdd: string[];
  labelsToRemove: string[];
  checklist: string[];
  reasons: string[];
}

export interface TriageData {
  description_matches_diff: "yes" | "partial" | "no";
  tests_included: boolean;
  risk_areas: string[];
  suggested_review_depth: "skim" | "standard" | "deep";
  flags: string[];
  summary: string;
}

export type TriageResult = { ok: true; data: TriageData } | { ok: false; reason: string };
