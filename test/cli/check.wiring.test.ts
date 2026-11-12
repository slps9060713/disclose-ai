import { describe, expect, it, vi } from "vitest";

// runCheck only builds a real GitHub API client (src/cli/check.ts:29, `createOctokitApi(token)`)
// when the caller supplies no `deps.api` -- every other test in test/cli/check.test.ts injects a
// fake api specifically to avoid that branch, since taking it for real would mean an actual
// network call to api.github.com. That makes the branch reachable only through this specific
// combination (no injected api, a token that does resolve), which is worth covering, but doing so
// without mocking createOctokitApi would make the test hit the real GitHub API -- flaky, slow, and
// dependent on network access the test run may not have. Mocking the constructor itself lets the
// real composition logic in runCheck run while keeping the actual HTTP calls fake.
const mockCreateOctokitApi = vi.hoisted(() => vi.fn());
vi.mock("../../src/github/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/github/api.js")>();
  return { ...actual, createOctokitApi: mockCreateOctokitApi };
});

const { runCheck } = await import("../../src/cli/check.js");
const { createFakeApi, stateFromContext } = await import("../helpers/fake-api.js");
const { loadFixture } = await import("../helpers/fixtures.js");

describe("runCheck (no injected api)", () => {
  it("builds its GitHub client via createOctokitApi using the resolved token", async () => {
    const { api } = createFakeApi(stateFromContext(loadFixture("claude-code-trailer")));
    mockCreateOctokitApi.mockReturnValue(api);

    const result = await runCheck(
      { refInput: "acme/widget#101", apply: false, policyPath: ".github/ai-policy.yml" },
      { resolveToken: () => "real-tok" },
    );

    expect(mockCreateOctokitApi).toHaveBeenCalledWith("real-tok");
    expect(result.ctx.owner).toBe("acme");
    expect(result.ctx.number).toBe(101);
  });
});
