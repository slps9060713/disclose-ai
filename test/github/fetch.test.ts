import { describe, expect, it } from "vitest";
import { fetchPolicyText, fetchPullRequestContext } from "../../src/github/fetch.js";
import { createFakeApi } from "../helpers/fake-api.js";

const ref = { owner: "acme", repo: "widget", number: 7 };

describe("fetchPullRequestContext", () => {
  it("maps pull and commits into a PullRequestContext", async () => {
    const { api } = createFakeApi({
      pull: {
        title: "t",
        body: null,
        user: { login: "copilot-swe-agent[bot]", type: "Bot" },
        head: { ref: "copilot/x" },
        base: { ref: "dev" },
        additions: 1,
        deletions: 2,
        changed_files: 3,
        labels: [{ name: "bug" }],
      },
    });
    const ctx = await fetchPullRequestContext(api, ref);
    expect(ctx).toMatchObject({
      owner: "acme",
      repo: "widget",
      number: 7,
      title: "t",
      body: "",
      author: { login: "copilot-swe-agent[bot]", type: "Bot" },
      headRef: "copilot/x",
      baseRef: "dev",
      additions: 1,
      deletions: 2,
      changedFiles: 3,
      labels: ["bug"],
    });
    expect(ctx.commits[0]).toEqual({
      sha: "a".repeat(40),
      message: "feat: add parser",
      author: { name: "Dev", email: "dev@example.com", login: "dev" },
    });
    expect(ctx.diff).toBeUndefined();
  });

  it("tolerates null commit authors", async () => {
    const { api } = createFakeApi({
      commits: [{ sha: "b".repeat(40), commit: { message: "m", author: null }, author: null }],
    });
    const ctx = await fetchPullRequestContext(api, ref);
    expect(ctx.commits[0]?.author).toEqual({ name: "", email: "", login: undefined });
    expect(ctx.author.type).toBe("User");
  });

  it("falls back to an unknown author when the pull has no user", async () => {
    const { api } = createFakeApi({
      pull: {
        title: "t",
        body: null,
        user: null,
        head: { ref: "feat/parser" },
        base: { ref: "main" },
        additions: 1,
        deletions: 1,
        changed_files: 1,
        labels: [],
      },
    });
    const ctx = await fetchPullRequestContext(api, ref);
    expect(ctx.author).toEqual({ login: "unknown", type: "User" });
  });
});

describe("fetchPolicyText", () => {
  it("reads the file from the base ref and returns undefined when missing", async () => {
    const { api, state } = createFakeApi({
      files: { "main:.github/ai-policy.yml": "version: 1\n" },
    });
    expect(await fetchPolicyText(api, ref, "main", ".github/ai-policy.yml")).toBe("version: 1\n");
    expect(await fetchPolicyText(api, ref, "other", ".github/ai-policy.yml")).toBeUndefined();
    expect(state.calls.filter((c) => c === "getFileText")).toHaveLength(2);
  });
});

describe("createFakeApi updateComment", () => {
  it("rejects with a 404 status when no comment matches the given id", async () => {
    const { api } = createFakeApi();
    await expect(api.updateComment(ref.owner, ref.repo, 999999, "new body")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("still updates an existing comment's body", async () => {
    const { api, state } = createFakeApi();
    await api.createComment(ref, "first");
    const id = state.comments[0]?.id;
    if (id === undefined) throw new Error("expected createComment to record a comment");
    await api.updateComment(ref.owner, ref.repo, id, "second");
    expect(state.comments.find((c) => c.id === id)?.body).toBe("second");
  });
});
