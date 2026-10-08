import { z } from "zod";

export const SessionTypeSchema = z.enum(["erg", "water"]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

/**
 * One suggested next session — the shape the model must return. The summary numbers
 * (`totalDistanceM`, `totalMinutes`, `targets.maxSpm`, `targets.fastestPacePer500s`) are what the
 * safety-limit validator checks; the text fields are for the rower.
 */
export const CoachingSuggestionSchema = z.object({
  sessionType: SessionTypeSchema,
  structure: z.string().max(300).describe('Session structure, e.g. "6 × 2 min / 2 min rest".'),
  totalDistanceM: z
    .number()
    .int()
    .positive()
    .max(100_000)
    .describe("Total distance of the whole session in metres, including warm-up, cool-down and rest paddling."),
  totalMinutes: z
    .number()
    .positive()
    .max(600)
    .describe("Total time of the whole session in minutes, work plus rest, including warm-up and cool-down."),
  targets: z.object({
    maxSpm: z
      .number()
      .min(10)
      .max(60)
      .describe("Highest stroke rate allowed anywhere in the session, in strokes per minute."),
    spmRange: z.string().max(20).optional().describe('Target stroke-rate range, e.g. "20-22".'),
    pacePer500m: z.string().max(20).optional().describe('Target pace per 500 m, e.g. "2:05".'),
    fastestPacePer500s: z
      .number()
      .positive()
      .max(600)
      .nullable()
      .describe(
        "Fastest pace target anywhere in the session, in seconds per 500 m (e.g. 125 for 2:05); null when the session has no pace target.",
      ),
  }),
  focus: z.string().max(200),
  reason: z.string().max(600),
  techniqueTip: z.string().max(400),
});

export type CoachingSuggestion = z.infer<typeof CoachingSuggestionSchema>;

/**
 * A stored or default suggestion: the model's shape, except a default may leave the distance open
 * (`totalDistanceM: null`). Every `CoachingSuggestion` is a `SuggestedSession`.
 */
export const SuggestedSessionSchema = CoachingSuggestionSchema.extend({
  totalDistanceM: z.number().int().positive().max(100_000).nullable(),
});

export type SuggestedSession = z.infer<typeof SuggestedSessionSchema>;

/**
 * Why a safe default was shown: the model failed (stored), the account is not on the allowlist, or no API key is
 * configured (neither of the last two is stored).
 */
export const SuggestionDefaultReasonSchema = z.enum(["model_failed", "not_allowed", "not_configured"]);
export type SuggestionDefaultReason = z.infer<typeof SuggestionDefaultReasonSchema>;

/** `POST /api/sessions/<id>/suggestion` response body; also what the session page passes to the suggestion panel. */
export const SuggestionPayloadSchema = z.object({
  suggestion: SuggestedSessionSchema,
  isDefault: z.boolean(),
  defaultReason: SuggestionDefaultReasonSchema.nullable(),
  /** false for defaults that are never stored (`not_allowed`, `not_configured`). */
  stored: z.boolean(),
});

export type SuggestionPayload = z.infer<typeof SuggestionPayloadSchema>;
