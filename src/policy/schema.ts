import { z } from "zod";

export const SIGNAL_IDS = [
  "coauthor-trailer",
  "branch-prefix",
  "bot-author",
  "session-trailer",
  "commit-pattern",
] as const;

const disclosureSchema = z
  .object({
    required: z.enum(["when-detected", "always", "never"]).default("when-detected"),
    fields: z.array(z.enum(["tool", "extent"])).default(["tool", "extent"]),
    heading: z.string().min(1).default("AI Disclosure"),
    no_ai_phrase: z.string().min(1).default("No AI tools were used"),
  })
  .strict();

const detectionSchema = z
  .object({
    signals: z.array(z.enum(SIGNAL_IDS)).default([...SIGNAL_IDS]),
    min_confidence: z.enum(["high", "medium", "low"]).default("medium"),
    custom_patterns: z.array(z.string()).default([]),
  })
  .strict();

const enforcementSchema = z
  .object({
    mode: z.enum(["comment+label", "label-only", "fail"]).default("comment+label"),
    comment_on_pass: z.boolean().default(false),
    labels: z
      .object({
        assisted: z.string().min(1).default("ai-assisted"),
        undisclosed: z.string().min(1).default("ai-undisclosed"),
      })
      .strict()
      .default({}),
    exempt: z
      .object({
        users: z.array(z.string()).default([]),
        bots: z
          .array(z.string())
          .default(["dependabot[bot]", "renovate[bot]", "github-actions[bot]"]),
      })
      .strict()
      .default({}),
  })
  .strict();

const codexSchema = z
  .object({
    enabled: z.boolean().default(false),
    model: z.string().default(""),
    min_changed_lines: z.number().int().nonnegative().default(20),
    max_diff_kb: z.number().int().positive().default(200),
    timeout_seconds: z.number().int().positive().default(180),
  })
  .strict();

export const policySchema = z
  .object({
    version: z.literal(1),
    disclosure: disclosureSchema.default({}),
    detection: detectionSchema.default({}),
    enforcement: enforcementSchema.default({}),
    review: z
      .object({ codex: codexSchema.default({}) })
      .strict()
      .default({}),
  })
  .strict();

export type Policy = z.infer<typeof policySchema>;
export type EnforcementMode = Policy["enforcement"]["mode"];

export const DEFAULT_POLICY: Policy = policySchema.parse({ version: 1 });
