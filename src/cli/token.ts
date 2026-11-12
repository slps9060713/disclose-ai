import { execFileSync } from "node:child_process";

export function resolveToken(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (env) return env;
  try {
    const out = execFileSync("gh", ["auth", "token"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}
