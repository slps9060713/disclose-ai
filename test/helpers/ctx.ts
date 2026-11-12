import type { Commit, PullRequestContext } from "../../src/types.js";

export function makeCommit(o: Partial<Commit> & { message: string }): Commit {
  return {
    sha: o.sha ?? "0123456789abcdef0123456789abcdef01234567",
    author: o.author ?? { name: "Dev", email: "dev@example.com", login: "dev" },
    message: o.message,
  };
}

export function makeCtx(o: Partial<PullRequestContext> = {}): PullRequestContext {
  return {
    owner: "acme",
    repo: "widget",
    number: 42,
    title: "Fix things",
    body: "",
    author: { login: "dev", type: "User" },
    headRef: "fix/things",
    baseRef: "main",
    commits: [makeCommit({ message: "fix: things" })],
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    labels: [],
    ...o,
  };
}
