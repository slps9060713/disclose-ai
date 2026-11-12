import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePolicy } from "../policy/parse.js";
import { CliError } from "./errors.js";

export const DEFAULT_POLICY_PATH = ".github/ai-policy.yml";

export async function runValidate(
  cwd: string,
  path: string | undefined,
): Promise<{ ok: true; path: string } | { ok: false; path: string; errors: string[] }> {
  const rel = path ?? DEFAULT_POLICY_PATH;
  let text: string;
  try {
    text = await readFile(join(cwd, rel), "utf8");
  } catch {
    throw new CliError(`Policy file not found: ${rel}. Run "disclose-ai init" to create one.`, 1);
  }
  const r = parsePolicy(text);
  return r.ok ? { ok: true, path: rel } : { ok: false, path: rel, errors: r.errors };
}
