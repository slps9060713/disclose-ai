import type { PullRequestContext } from "../types.js";
import type { GitHubApi, PullRef } from "./api.js";

export async function fetchPullRequestContext(
  api: GitHubApi,
  ref: PullRef,
): Promise<PullRequestContext> {
  const [pull, commits] = await Promise.all([api.getPull(ref), api.listCommits(ref)]);
  return {
    owner: ref.owner,
    repo: ref.repo,
    number: ref.number,
    title: pull.title,
    body: pull.body ?? "",
    author: {
      login: pull.user?.login ?? "unknown",
      type: pull.user?.type === "Bot" ? "Bot" : "User",
    },
    headRef: pull.head.ref,
    baseRef: pull.base.ref,
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: {
        name: c.commit.author?.name ?? "",
        email: c.commit.author?.email ?? "",
        login: c.author?.login,
      },
    })),
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    labels: pull.labels.map((l) => l.name),
  };
}

export function fetchPolicyText(
  api: GitHubApi,
  ref: PullRef,
  baseRef: string,
  path: string,
): Promise<string | undefined> {
  return api.getFileText(ref.owner, ref.repo, path, baseRef);
}
