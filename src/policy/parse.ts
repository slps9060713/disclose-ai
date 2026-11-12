import { parse as parseYaml } from "yaml";
import { DEFAULT_POLICY, type Policy, policySchema } from "./schema.js";

export type PolicyParseResult =
  | { ok: true; policy: Policy; source: "file" | "default" }
  | { ok: false; errors: string[] };

export function parsePolicy(text: string | undefined): PolicyParseResult {
  if (text === undefined) return { ok: true, policy: DEFAULT_POLICY, source: "default" };

  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (err) {
    return { ok: false, errors: [`YAML parse error: ${(err as Error).message}`] };
  }

  const result = policySchema.safeParse(data ?? {});
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
    return { ok: false, errors };
  }
  return { ok: true, policy: result.data, source: "file" };
}
