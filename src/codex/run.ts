import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Policy } from "../policy/schema.js";
import type { PullRequestContext, TriageResult } from "../types.js";
import type { Exec } from "./exec.js";
import { buildTriagePrompt } from "./prompt.js";
import { TRIAGE_JSON_SCHEMA, triageSchema } from "./schema.js";

/** Pinned Codex CLI version. Bump deliberately; the output format is validated against triageSchema either way. */
export const CODEX_CLI_VERSION = "0.155.0";

const ENV_PASSTHROUGH = [
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "npm_config_cache",
  "SystemRoot",
];

export interface TriageDeps {
  exec: Exec;
  apiKey: string;
  model?: string;
  codexVersion?: string;
  mkTmpDir?: () => Promise<string>;
}

const tail = (s: string) => s.trim().split("\n").slice(-3).join(" ").slice(0, 300);

export async function runTriage(
  ctx: PullRequestContext,
  policy: Policy,
  deps: TriageDeps,
): Promise<TriageResult> {
  if (!ctx.diff) return { ok: false, reason: "no diff available" };
  const cfg = policy.review.codex;
  let dir: string | undefined;
  try {
    dir = await (deps.mkTmpDir ?? (() => mkdtemp(join(tmpdir(), "disclose-ai-codex-"))))();
    const schemaPath = join(dir, "schema.json");
    const outPath = join(dir, "out.json");
    const workDir = join(dir, "work");
    await mkdir(workDir, { recursive: true });
    await writeFile(schemaPath, JSON.stringify(TRIAGE_JSON_SCHEMA), "utf8");

    const { prompt } = buildTriagePrompt({ ctx, policy, diff: ctx.diff });
    const model = deps.model || cfg.model;
    const args = [
      "--yes",
      "--package",
      `@openai/codex@${deps.codexVersion ?? CODEX_CLI_VERSION}`,
      "codex",
      "exec",
      // workDir is a fresh temp dir, never a git repository; without this codex exits 1.
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--ignore-rules",
      "--ignore-user-config",
      "--output-schema",
      schemaPath,
      "-o",
      outPath,
      "--cd",
      workDir,
      ...(model ? ["--model", model] : []),
      "-",
    ];
    const env: NodeJS.ProcessEnv = { CODEX_API_KEY: deps.apiKey };
    for (const k of ENV_PASSTHROUGH) if (process.env[k] !== undefined) env[k] = process.env[k];

    const res = await deps.exec("npx", args, {
      cwd: workDir,
      env,
      timeoutMs: cfg.timeout_seconds * 1000,
      stdin: prompt,
    });
    if (res.timedOut) return { ok: false, reason: `timeout after ${cfg.timeout_seconds}s` };
    if (res.code !== 0)
      return {
        ok: false,
        reason: `codex exited with ${res.code}: ${tail(res.stderr) || "no stderr"}`,
      };

    let raw: string;
    try {
      raw = await readFile(outPath, "utf8");
    } catch {
      return { ok: false, reason: "codex produced no output file" };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "codex output was not valid JSON" };
    }
    const parsed = triageSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        reason: `codex output failed schema validation: ${issue ? `${issue.path.join(".")}: ${issue.message}` : "unknown"}`,
      };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
