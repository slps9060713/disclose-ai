import { describe, expect, it } from "vitest";
import { CONFIDENCE_RANK } from "../src/types.js";

describe("smoke", () => {
  it("ranks confidence low < medium < high", () => {
    expect(CONFIDENCE_RANK.low).toBeLessThan(CONFIDENCE_RANK.medium);
    expect(CONFIDENCE_RANK.medium).toBeLessThan(CONFIDENCE_RANK.high);
  });
});
