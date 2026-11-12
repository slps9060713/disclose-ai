import { readFileSync } from "node:fs";
import type { PullRequestContext } from "../../src/types.js";

export function loadFixture(name: string): PullRequestContext {
  const url = new URL(`../fixtures/prs/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as PullRequestContext;
}
