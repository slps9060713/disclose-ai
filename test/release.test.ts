import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

interface Step {
  run?: string;
}
interface Job {
  needs?: string | string[];
  steps?: Step[];
}

const readYaml = (path: string) => parseYaml(readFileSync(path, "utf8"));
const runsTagMove = (job: Job) =>
  (job.steps ?? []).some((s) => /git tag -f "v\$\{\{/.test(s.run ?? ""));

describe("release workflow", () => {
  const jobs: Record<string, Job> = readYaml(".github/workflows/release.yml").jobs;

  it("moves the floating major tag without waiting for npm publish", () => {
    // `disclose-ai init` scaffolds `uses: slps9060713/disclose-ai@v1`, so the major tag is what makes
    // the Action usable at all. npm publish is a separate channel that is expected to fail on the very
    // first release (see CONTRIBUTING.md), and it must not take the Action down with it.
    const movers = Object.entries(jobs).filter(([, job]) => runsTagMove(job));
    expect(movers.map(([name]) => name)).not.toContain("publish");
    expect(movers).toHaveLength(1);
    const [, mover] = movers[0] as [string, Job];
    expect([mover.needs].flat()).toEqual(["release-please"]);
  });
});
