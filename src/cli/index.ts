import { Command } from "commander";
import type { GitHubApi } from "../github/api.js";
import { TEMPLATE_NAMES, type TemplateName } from "../policy/templates.js";
import { runCheck } from "./check.js";
import { CliError } from "./errors.js";
import { formatCheckSummary } from "./format.js";
import { runInit } from "./init.js";
import { resolveToken as defaultResolveToken } from "./token.js";
import { DEFAULT_POLICY_PATH, runValidate } from "./validate.js";
import { readVersion } from "./version.js";

export interface CliDeps {
  cwd: string;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  setExitCode: (code: number) => void;
  api?: GitHubApi;
  resolveToken?: (explicit?: string) => string | undefined;
}

export function createProgram(deps: CliDeps): Command {
  const program = new Command()
    .name("disclose-ai")
    .description("AI contribution policy as code for pull requests")
    .version(readVersion())
    .exitOverride()
    .configureOutput({ writeOut: deps.stdout, writeErr: deps.stderr });

  program
    .command("init")
    .description("write .github/ai-policy.yml (and optionally the workflow)")
    .option("-t, --template <name>", `one of ${TEMPLATE_NAMES.join(", ")}`, "standard")
    .option("--with-workflow", "also write .github/workflows/disclose-ai.yml", false)
    .option("-f, --force", "overwrite existing files", false)
    .action(async (o: { template: string; withWorkflow: boolean; force: boolean }) => {
      if (!(TEMPLATE_NAMES as readonly string[]).includes(o.template)) {
        throw new CliError(
          `Unknown template "${o.template}". Use one of ${TEMPLATE_NAMES.join(", ")}.`,
          2,
        );
      }
      const r = await runInit(deps.cwd, {
        template: o.template as TemplateName,
        withWorkflow: o.withWorkflow,
        force: o.force,
      });
      for (const f of r.written) deps.stdout(`wrote ${f}\n`);
      deps.stdout(
        "Next: commit these files. Contributors will be asked to disclose AI assistance per the policy.\n",
      );
    });

  program
    .command("validate")
    .description("validate a policy file")
    .argument("[path]", "policy file path", DEFAULT_POLICY_PATH)
    .action(async (path: string) => {
      const r = await runValidate(deps.cwd, path);
      if (r.ok) {
        deps.stdout(`${r.path} is valid\n`);
        return;
      }
      deps.stderr(`${r.path} is invalid:\n${r.errors.map((e) => `  - ${e}`).join("\n")}\n`);
      throw new CliError(`${r.errors.length} policy error(s)`, 1);
    });

  program
    .command("check")
    .description("evaluate a pull request against the repository policy (dry run unless --apply)")
    .argument("<ref>", "owner/repo#123 or a pull request URL")
    .option("--token <token>", "GitHub token (default: GITHUB_TOKEN, GH_TOKEN, or `gh auth token`)")
    .option("--apply", "post the comment and sync labels", false)
    .option("--json", "print the full result as JSON", false)
    .option("--policy-path <path>", "policy path in the base branch", DEFAULT_POLICY_PATH)
    .action(
      async (
        refInput: string,
        o: { token?: string; apply: boolean; json: boolean; policyPath: string },
      ) => {
        const result = await runCheck(
          { refInput, token: o.token, apply: o.apply, policyPath: o.policyPath },
          { api: deps.api, resolveToken: deps.resolveToken ?? defaultResolveToken },
        );
        deps.stdout(
          o.json ? `${JSON.stringify(result, null, 2)}\n` : formatCheckSummary(result, o.apply),
        );
        deps.setExitCode(result.exitCode);
      },
    );

  return program;
}
