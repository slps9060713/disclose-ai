import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getTemplate, type TemplateName } from "../policy/templates.js";
import { CliError } from "./errors.js";

export const WORKFLOW_TEMPLATE = [
  "name: disclose-ai",
  "on:",
  "  pull_request_target:",
  "    types: [opened, synchronize, edited, reopened]",
  "concurrency:",
  "  group: disclose-ai-${{ github.event.pull_request.number }}",
  "  cancel-in-progress: true",
  "permissions:",
  "  contents: read",
  "  pull-requests: write",
  "  issues: write",
  "jobs:",
  "  gate:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      # No checkout step here on purpose: disclose-ai reads everything through the GitHub API",
  "      # and never checks out or executes code from the pull request.",
  "      - uses: slps9060713/disclose-ai@v1",
  "        with:",
  "          openai-api-key: ${{ secrets.OPENAI_API_KEY }} # optional: remove this line to disable Codex triage",
  "",
].join("\n");

export interface InitOptions {
  template: TemplateName;
  withWorkflow: boolean;
  force: boolean;
}

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

export async function runInit(cwd: string, opts: InitOptions): Promise<{ written: string[] }> {
  const targets: Array<[string, string]> = [[".github/ai-policy.yml", getTemplate(opts.template)]];
  if (opts.withWorkflow) targets.push([".github/workflows/disclose-ai.yml", WORKFLOW_TEMPLATE]);

  if (!opts.force) {
    for (const [rel] of targets) {
      if (await exists(join(cwd, rel)))
        throw new CliError(`${rel} already exists. Use --force to overwrite it.`, 1);
    }
  }
  const written: string[] = [];
  for (const [rel, content] of targets) {
    const abs = join(cwd, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    written.push(rel);
  }
  return { written };
}
