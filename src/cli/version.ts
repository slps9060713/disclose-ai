import { createRequire } from "node:module";

/** Reads the version from package.json at runtime. src/cli/* and dist/cli/* are both two levels below the package root. */
export function readVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
