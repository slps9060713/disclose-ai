import type {
  CommentData,
  CommitData,
  GitHubApi,
  PullData,
  PullRef,
} from "../../src/github/api.js";
import type { PullRequestContext } from "../../src/types.js";

export interface FakeState {
  pull: PullData;
  commits: CommitData[];
  diff: string;
  files: Record<string, string>; // key: `${ref}:${path}`
  comments: CommentData[];
  labels: Set<string>;
  repoLabels: Set<string>;
  // undefined mirrors the real adapter's behaviour for the Action's default `GITHUB_TOKEN`,
  // whose `GET /user` call is caught as a 403 and turned into undefined rather than a throw.
  authenticatedLogin: string | undefined;
  calls: string[];
  failOnce: Partial<Record<keyof GitHubApi, Error>>;
  failAlways: Partial<Record<keyof GitHubApi, Error>>;
}

export function createFakeApi(overrides: Partial<FakeState> = {}): {
  api: GitHubApi;
  state: FakeState;
} {
  const state: FakeState = {
    pull: {
      title: "feat: add parser",
      body: "Adds the parser.",
      user: { login: "dev", type: "User" },
      head: { ref: "feat/parser" },
      base: { ref: "main" },
      additions: 40,
      deletions: 8,
      changed_files: 3,
      labels: [],
    },
    commits: [
      {
        sha: "a".repeat(40),
        commit: { message: "feat: add parser", author: { name: "Dev", email: "dev@example.com" } },
        author: { login: "dev" },
      },
    ],
    diff: "diff --git a/x b/x\n+hello\n",
    files: {},
    comments: [],
    labels: new Set(),
    repoLabels: new Set(),
    authenticatedLogin: undefined,
    calls: [],
    failOnce: {},
    failAlways: {},
    ...overrides,
  };
  let nextId = 1000;

  const guard = (name: keyof GitHubApi) => {
    state.calls.push(name);
    if (state.failAlways[name]) throw state.failAlways[name];
    const once = state.failOnce[name];
    if (once) {
      delete state.failOnce[name];
      throw once;
    }
  };

  const api: GitHubApi = {
    async getPull() {
      guard("getPull");
      return state.pull;
    },
    async listCommits() {
      guard("listCommits");
      return state.commits;
    },
    async getDiff() {
      guard("getDiff");
      return state.diff;
    },
    async getFileText(_o, _r, path, ref) {
      guard("getFileText");
      return state.files[`${ref}:${path}`];
    },
    async listComments() {
      guard("listComments");
      return state.comments;
    },
    async getAuthenticatedLogin() {
      guard("getAuthenticatedLogin");
      return state.authenticatedLogin;
    },
    async createComment(_ref: PullRef, body) {
      guard("createComment");
      state.comments.push({
        id: nextId++,
        body,
        user: { login: "github-actions[bot]", type: "Bot" },
      });
    },
    async updateComment(_o, _r, id, body) {
      guard("updateComment");
      const c = state.comments.find((x) => x.id === id);
      if (!c) {
        throw Object.assign(new Error(`updateComment: no comment with id ${id}`), { status: 404 });
      }
      c.body = body;
    },
    async addLabels(_ref, labels) {
      guard("addLabels");
      for (const l of labels) state.labels.add(l);
    },
    async removeLabel(_ref, label) {
      guard("removeLabel");
      state.labels.delete(label);
    },
    async ensureLabel(_o, _r, name) {
      guard("ensureLabel");
      state.repoLabels.add(name);
    },
  };
  return { api, state };
}

export function stateFromContext(ctx: PullRequestContext): Partial<FakeState> {
  return {
    pull: {
      title: ctx.title,
      body: ctx.body,
      user: { login: ctx.author.login, type: ctx.author.type },
      head: { ref: ctx.headRef },
      base: { ref: ctx.baseRef },
      additions: ctx.additions,
      deletions: ctx.deletions,
      changed_files: ctx.changedFiles,
      labels: ctx.labels.map((name) => ({ name })),
    },
    commits: ctx.commits.map((c) => ({
      sha: c.sha,
      commit: { message: c.message, author: { name: c.author.name, email: c.author.email } },
      author: c.author.login ? { login: c.author.login } : null,
    })),
    labels: new Set(ctx.labels),
  };
}
