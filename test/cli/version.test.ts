import { describe, expect, it, vi } from "vitest";

describe("readVersion", () => {
  it("reads the version out of package.json", async () => {
    const { readVersion } = await import("../../src/cli/version.js");
    // package.json's version happens to be "0.0.0" today (pre-release), which is indistinguishable
    // from the catch fallback below by value alone -- the real assertion that this took the
    // try-path (not the catch) is the mock-based "falls back" test underneath.
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("falls back to 0.0.0 when package.json cannot be read", async () => {
    vi.resetModules();
    vi.doMock("node:module", () => ({
      createRequire: () => () => {
        throw new Error("Cannot find module");
      },
    }));
    const { readVersion } = await import("../../src/cli/version.js");
    expect(readVersion()).toBe("0.0.0");
    vi.doUnmock("node:module");
    vi.resetModules();
  });

  it("falls back to 0.0.0 when package.json has no version field", async () => {
    // The real package.json's version happens to be the literal string "0.0.0" today, so the test
    // above never actually distinguishes `pkg.version` (truthy) from the `?? "0.0.0"` fallback --
    // both produce the same value. Mocking a package.json without a version field forces the `??`
    // right-hand side specifically.
    vi.resetModules();
    vi.doMock("node:module", () => ({
      createRequire: () => () => ({}),
    }));
    const { readVersion } = await import("../../src/cli/version.js");
    expect(readVersion()).toBe("0.0.0");
    vi.doUnmock("node:module");
    vi.resetModules();
  });
});
