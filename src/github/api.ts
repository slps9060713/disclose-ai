import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";

export interface PullRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PullData {
  title: string;
  body: string | null;
  user: { login: string; type: string } | null;
  head: { ref: string };
  base: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
  labels: Array<{ name: string }>;
}

export interface CommitData {
  sha: string;
  commit: { message: string; author: { name?: string | null; email?: string | null } | null };
  author: { login: string } | null;
}

export interface CommentData {
  id: number;
  body?: string;
  user: { login: string; type?: string } | null;
}

export interface GitHubApi {
  getPull(ref: PullRef): Promise<PullData>;
  listCommits(ref: PullRef): Promise<CommitData[]>;
  getDiff(ref: PullRef): Promise<string>;
  getFileText(owner: string, repo: string, path: string, ref: string): Promise<string | undefined>;
  listComments(ref: PullRef): Promise<CommentData[]>;
  /**
   * The login of the identity this client is authenticated as, or undefined when it cannot be
   * determined. `GET /user` returns 403 for the Action's default `GITHUB_TOKEN` (it has no user
   * to authenticate as), so undefined is the expected, normal result there -- callers must treat
   * it as "unknown", not as an error.
   */
  getAuthenticatedLogin(): Promise<string | undefined>;
  createComment(ref: PullRef, body: string): Promise<void>;
  updateComment(owner: string, repo: string, commentId: number, body: string): Promise<void>;
  addLabels(ref: PullRef, labels: string[]): Promise<void>;
  removeLabel(ref: PullRef, label: string): Promise<void>;
  ensureLabel(
    owner: string,
    repo: string,
    name: string,
    color: string,
    description: string,
  ): Promise<void>;
}

const status = (err: unknown): number | undefined => (err as { status?: number }).status;

export function createOctokitApi(token: string): GitHubApi {
  const OctokitWithPlugins = Octokit.plugin(retry, throttling);
  const octokit = new OctokitWithPlugins({
    auth: token,
    userAgent: "disclose-ai",
    throttle: {
      onRateLimit: (_retryAfter, _options, _o, retryCount) => retryCount < 2,
      onSecondaryRateLimit: (_retryAfter, _options, _o, retryCount) => retryCount < 2,
    },
  });
  const pull = (ref: PullRef) => ({ owner: ref.owner, repo: ref.repo, pull_number: ref.number });
  const issue = (ref: PullRef) => ({ owner: ref.owner, repo: ref.repo, issue_number: ref.number });

  return {
    async getPull(ref) {
      const { data } = await octokit.pulls.get(pull(ref));
      return data as unknown as PullData;
    },
    async listCommits(ref) {
      return (await octokit.paginate(octokit.pulls.listCommits, {
        ...pull(ref),
        per_page: 100,
      })) as unknown as CommitData[];
    },
    async getDiff(ref) {
      const { data } = await octokit.pulls.get({ ...pull(ref), mediaType: { format: "diff" } });
      return data as unknown as string;
    },
    async getFileText(owner, repo, path, ref) {
      try {
        const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return undefined;
        return Buffer.from(data.content, "base64").toString("utf8");
      } catch (err) {
        if (status(err) === 404) return undefined;
        throw err;
      }
    },
    async listComments(ref) {
      return (await octokit.paginate(octokit.issues.listComments, {
        ...issue(ref),
        per_page: 100,
      })) as unknown as CommentData[];
    },
    async getAuthenticatedLogin() {
      try {
        const { data } = await octokit.users.getAuthenticated();
        return data.login;
      } catch (err) {
        if (status(err) === 403) return undefined;
        throw err;
      }
    },
    async createComment(ref, body) {
      await octokit.issues.createComment({ ...issue(ref), body });
    },
    async updateComment(owner, repo, comment_id, body) {
      await octokit.issues.updateComment({ owner, repo, comment_id, body });
    },
    async addLabels(ref, labels) {
      await octokit.issues.addLabels({ ...issue(ref), labels });
    },
    async removeLabel(ref, name) {
      try {
        await octokit.issues.removeLabel({ ...issue(ref), name });
      } catch (err) {
        if (status(err) !== 404) throw err;
      }
    },
    async ensureLabel(owner, repo, name, color, description) {
      try {
        await octokit.issues.getLabel({ owner, repo, name });
      } catch (err) {
        if (status(err) !== 404) throw err;
        await octokit.issues.createLabel({ owner, repo, name, color, description });
      }
    },
  };
}
