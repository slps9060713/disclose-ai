import { z } from "zod";

export const triageSchema = z
  .object({
    description_matches_diff: z.enum(["yes", "partial", "no"]),
    tests_included: z.boolean(),
    risk_areas: z.array(z.string().max(80)).max(6),
    suggested_review_depth: z.enum(["skim", "standard", "deep"]),
    flags: z.array(z.string().max(160)).max(6),
    summary: z.string().max(280),
  })
  .strict();

export const TRIAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "description_matches_diff",
    "tests_included",
    "risk_areas",
    "suggested_review_depth",
    "flags",
    "summary",
  ],
  properties: {
    description_matches_diff: { type: "string", enum: ["yes", "partial", "no"] },
    tests_included: { type: "boolean" },
    risk_areas: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: 6 },
    suggested_review_depth: { type: "string", enum: ["skim", "standard", "deep"] },
    flags: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 6 },
    summary: { type: "string", maxLength: 280 },
  },
} as const;
