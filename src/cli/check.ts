import { createOctokitApi, type GitHubApi } from "../github/api.js";
import { type GateResult, runGate } from "../run.js";
import { CliError } from "./errors.js";
import { parsePullRef } from "./ref.js";

export interface CheckOptions {
  refInput: string;
  token?: string;
  apply: boolean;
  policyPath: string;
}

export interface CheckDeps {
  api?: GitHubApi;
  resolveToken: (explicit?: string) => string | undefined;
}

export async function runCheck(opts: CheckOptions, deps: CheckDeps): Promise<GateResult> {
  const ref = parsePullRef(opts.refInput);
  let api = deps.api;
  if (!api) {
    const token = deps.resolveToken(opts.token);
    if (!token) {
      throw new CliError(
        "No GitHub token found. Pass --token <token>, set GITHUB_TOKEN (or GH_TOKEN), or log in with the GitHub CLI so `gh auth token` works.",
        2,
      );
    }
    api = createOctokitApi(token);
  }
  return runGate({ ref, policyPath: opts.policyPath, apply: opts.apply }, { api });
}
