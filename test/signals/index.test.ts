import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "../../src/policy/schema.js";
import { detectSignals } from "../../src/signals/index.js";
import { loadFixture } from "../helpers/fixtures.js";

describe("detectSignals", () => {
  it("runs every enabled detector", () => {
    const ids = detectSignals(loadFixture("copilot-bot"), DEFAULT_POLICY.detection)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["bot-author", "branch-prefix", "coauthor-trailer"]);
  });

  it("concatenates detector results in detection.signals order, not sorted", () => {
    const forward = detectSignals(loadFixture("copilot-bot"), {
      ...DEFAULT_POLICY.detection,
      signals: ["bot-author", "branch-prefix"],
    });
    expect(forward.map((s) => s.id)).toEqual(["bot-author", "branch-prefix"]);

    const reversed = detectSignals(loadFixture("copilot-bot"), {
      ...DEFAULT_POLICY.detection,
      signals: ["branch-prefix", "bot-author"],
    });
    expect(reversed.map((s) => s.id)).toEqual(["branch-prefix", "bot-author"]);
  });

  it("honours the enabled subset", () => {
    const s = detectSignals(loadFixture("copilot-bot"), {
      ...DEFAULT_POLICY.detection,
      signals: ["branch-prefix"],
    });
    expect(s.map((x) => x.id)).toEqual(["branch-prefix"]);
  });

  it("returns nothing for a human PR", () => {
    expect(detectSignals(loadFixture("human"), DEFAULT_POLICY.detection)).toEqual([]);
  });
});
