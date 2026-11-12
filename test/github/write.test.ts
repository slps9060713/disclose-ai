import { describe, expect, it } from "vitest";
import type { GitHubApi } from "../../src/github/api.js";
import { syncLabels, upsertComment } from "../../src/github/write.js";
import { DEFAULT_POLICY } from "../../src/policy/schema.js";
import { COMMENT_MARKER } from "../../src/report/comment.js";
import { createFakeApi } from "../helpers/fake-api.js";

const ref = { owner: "acme", repo: "widget", number: 7 };
const names = DEFAULT_POLICY.enforcement.labels;

describe("upsertComment", () => {
  it("creates when no marker comment exists", async () => {
    const { api, state } = createFakeApi({
      comments: [{ id: 1, body: "unrelated", user: { login: "someone" } }],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nhello`)).toBe("created");
    expect(state.comments).toHaveLength(2);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "createComment"]);
  });

  it("updates the existing marker comment", async () => {
    const { api, state } = createFakeApi({
      comments: [
        {
          id: 5,
          body: `${COMMENT_MARKER}\nold`,
          user: { login: "github-actions[bot]", type: "Bot" },
        },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(state.comments[0]?.body).toBe(`${COMMENT_MARKER}\nnew`);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "updateComment"]);
  });

  it("retries once on a transient failure", async () => {
    const { api, state } = createFakeApi({ failOnce: { createComment: new Error("502") } });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nx`)).toBe("created");
    expect(state.calls.filter((c) => c === "createComment")).toHaveLength(2);
  });

  it("throws after the second failure", async () => {
    const { api } = createFakeApi({ failAlways: { createComment: new Error("403 forbidden") } });
    await expect(upsertComment(api, ref, "x")).rejects.toThrow("403 forbidden");
  });

  // Authorized deviation: a comment only qualifies as ours when its body starts with
  // COMMENT_MARKER AND its author is a bot. Anything else must be ignored, or a
  // contributor could plant the marker in their own comment and hijack the lookup.
  it("ignores a contributor-authored comment whose body starts with the marker", async () => {
    const { api, state } = createFakeApi({
      comments: [
        {
          id: 1,
          body: `${COMMENT_MARKER}\nspoofed by a contributor`,
          user: { login: "mallory", type: "User" },
        },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nhello`)).toBe("created");
    expect(state.comments).toHaveLength(2);
    expect(state.comments[0]?.body).toBe(`${COMMENT_MARKER}\nspoofed by a contributor`);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "createComment"]);
  });

  it("ignores a bot comment where the marker appears mid-body rather than at the start", async () => {
    const { api, state } = createFakeApi({
      comments: [
        {
          id: 1,
          body: `not the start ${COMMENT_MARKER}\nbody`,
          user: { login: "github-actions[bot]", type: "Bot" },
        },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nhello`)).toBe("created");
    expect(state.comments).toHaveLength(2);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "createComment"]);
  });

  it("updates a bot comment whose body starts with the marker (legitimate case)", async () => {
    const { api, state } = createFakeApi({
      comments: [
        {
          id: 5,
          body: `${COMMENT_MARKER}\nold`,
          user: { login: "github-actions[bot]", type: "Bot" },
        },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]?.body).toBe(`${COMMENT_MARKER}\nnew`);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "updateComment"]);
  });

  it("treats a comment with a null user as not ours", async () => {
    const { api, state } = createFakeApi({
      comments: [{ id: 1, body: `${COMMENT_MARKER}\nold`, user: null }],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("created");
    expect(state.comments).toHaveLength(2);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "createComment"]);
  });

  it("treats a bot comment with no body at all as not ours", async () => {
    const { api, state } = createFakeApi({
      comments: [{ id: 1, user: { login: "github-actions[bot]", type: "Bot" } }],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("created");
    expect(state.comments).toHaveLength(2);
    expect(state.calls).toEqual(["getAuthenticatedLogin", "listComments", "createComment"]);
  });

  // Authorized deviation (2b, final whole-branch review): isOwnComment required user.type ===
  // "Bot", so `disclose-ai check --apply` and any Action wired to a personal access token never
  // recognised their own prior comment and posted a fresh one every run (verified: two --apply
  // runs, two comments). When the client can resolve its own authenticated identity, match on
  // that login instead of the Bot-type rule -- a PAT authenticates as a human account.
  it("recognises its own comment by authenticated identity when the token is a personal access token", async () => {
    const { api, state } = createFakeApi({
      authenticatedLogin: "dean-bot-runner",
      comments: [
        { id: 5, body: `${COMMENT_MARKER}\nold`, user: { login: "dean-bot-runner", type: "User" } },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]?.body).toBe(`${COMMENT_MARKER}\nnew`);
  });

  it("identity matching is case-insensitive on the login", async () => {
    const { api, state } = createFakeApi({
      authenticatedLogin: "Dean-Bot-Runner",
      comments: [
        { id: 5, body: `${COMMENT_MARKER}\nold`, user: { login: "dean-bot-runner", type: "User" } },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(state.comments).toHaveLength(1);
  });

  // Once identity is known, it is authoritative -- a marker comment from someone else is never
  // "close enough" just because both authenticate as non-bot users.
  it("does not match a different user's marker comment once identity is known", async () => {
    const { api, state } = createFakeApi({
      authenticatedLogin: "dean-bot-runner",
      comments: [
        { id: 5, body: `${COMMENT_MARKER}\nold`, user: { login: "someone-else", type: "User" } },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("created");
    expect(state.comments).toHaveLength(2);
    expect(state.comments[0]?.body).toBe(`${COMMENT_MARKER}\nold`);
  });

  // Identity is known, but this particular comment has no user at all (e.g. a deleted account).
  // c.user?.login is then undefined, and the `?? ""` fallback must not coincidentally equal a
  // real identity string.
  it("treats a comment with a null user as not ours even when identity is known", async () => {
    const { api, state } = createFakeApi({
      authenticatedLogin: "dean-bot-runner",
      comments: [{ id: 1, body: `${COMMENT_MARKER}\nold`, user: null }],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("created");
    expect(state.comments).toHaveLength(2);
  });

  // The normal path for the Action's default GITHUB_TOKEN: GET /user returns 403, so identity is
  // undefined and every prior test above (default authenticatedLogin: undefined) exercises this
  // fallback already. This test pins the fallback explicitly against a Bot-authored comment whose
  // login would not equal any identity, to make the "identity unknown" contract unmistakable.
  it("falls back to the Bot-type rule when identity cannot be determined", async () => {
    const { api, state } = createFakeApi({
      authenticatedLogin: undefined,
      comments: [
        {
          id: 5,
          body: `${COMMENT_MARKER}\nold`,
          user: { login: "github-actions[bot]", type: "Bot" },
        },
      ],
    });
    expect(await upsertComment(api, ref, `${COMMENT_MARKER}\nnew`)).toBe("updated");
    expect(state.comments).toHaveLength(1);
  });
});

describe("syncLabels", () => {
  it("ensures, adds and removes labels", async () => {
    const { api, state } = createFakeApi({ labels: new Set(["ai-undisclosed"]) });
    const r = await syncLabels(api, ref, ["ai-assisted"], ["ai-undisclosed"], names);
    expect(r).toEqual({ added: ["ai-assisted"], removed: ["ai-undisclosed"], warnings: [] });
    expect(state.repoLabels.has("ai-assisted")).toBe(true);
    expect([...state.labels]).toEqual(["ai-assisted"]);
  });

  it("does nothing when there is nothing to do", async () => {
    const { api, state } = createFakeApi();
    await syncLabels(api, ref, [], [], names);
    expect(state.calls).toEqual([]);
  });

  it("records warnings instead of throwing", async () => {
    const { api } = createFakeApi({
      failAlways: { ensureLabel: new Error("no permission"), removeLabel: new Error("boom") },
    });
    const r = await syncLabels(api, ref, ["ai-assisted"], ["ai-undisclosed"], names);
    expect(r.added).toEqual(["ai-assisted"]);
    expect(r.removed).toEqual([]);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/could not create label "ai-assisted"/);
  });

  it("uses the undisclosed label metadata when the added label is not the assisted one", async () => {
    const { api, state } = createFakeApi();
    const r = await syncLabels(api, ref, [names.undisclosed], [], names);
    expect(r).toEqual({ added: [names.undisclosed], removed: [], warnings: [] });
    expect(state.repoLabels.has(names.undisclosed)).toBe(true);
  });

  it("records a warning when addLabels itself fails, without marking the label added", async () => {
    const { api } = createFakeApi({ failAlways: { addLabels: new Error("no access") } });
    const r = await syncLabels(api, ref, ["ai-assisted"], [], names);
    expect(r.added).toEqual([]);
    expect(r.warnings).toEqual(["could not add labels ai-assisted: no access"]);
  });

  // syncLabels accepts anything satisfying GitHubApi, not only the fake -- so a rejection
  // that is not an Error (e.g. a bare string, as a misbehaving or non-Octokit client might
  // throw) can be exercised through a minimal stub without touching test/helpers/fake-api.ts.
  // This pins the `message()` fallback's String(err) formatting, not just that the branch runs.
  it("stringifies a non-Error rejection in the warning message", async () => {
    const unreachable = () => Promise.reject(new Error("should not be called"));
    const stubApi: GitHubApi = {
      getPull: unreachable,
      listCommits: unreachable,
      getDiff: unreachable,
      getFileText: unreachable,
      listComments: unreachable,
      getAuthenticatedLogin: unreachable,
      createComment: unreachable,
      updateComment: unreachable,
      addLabels: () => Promise.resolve(),
      removeLabel: unreachable,
      ensureLabel: () => Promise.reject("boom (not an Error instance)"),
    };
    const r = await syncLabels(stubApi, ref, ["ai-assisted"], [], names);
    expect(r.added).toEqual(["ai-assisted"]);
    expect(r.warnings).toEqual([
      'could not create label "ai-assisted": boom (not an Error instance)',
    ]);
  });
});
