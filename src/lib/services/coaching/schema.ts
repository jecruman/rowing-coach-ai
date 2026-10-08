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
  structure: z.string().describe('Session structure, e.g. "6 × 2 min / 2 min rest".'),
  totalDistanceM: z
    .number()
    .int()
    .describe("Total distance of the whole session in metres, including warm-up, cool-down and rest paddling."),
  totalMinutes: z
    .number()
    .describe("Total time of the whole session in minutes, work plus rest, including warm-up and cool-down."),
  targets: z.object({
    maxSpm: z.number().describe("Highest stroke rate allowed anywhere in the session, in strokes per minute."),
    spmRange: z.string().optional().describe('Target stroke-rate range, e.g. "20-22".'),
    pacePer500m: z.string().optional().describe('Target pace per 500 m, e.g. "2:05".'),
    fastestPacePer500s: z
      .number()
      .nullable()
      .describe(
        "Fastest pace target anywhere in the session, in seconds per 500 m (e.g. 125 for 2:05); null when the session has no pace target.",
      ),
  }),
  focus: z.string(),
  reason: z.string(),
  techniqueTip: z.string(),
});

export type CoachingSuggestion = z.infer<typeof CoachingSuggestionSchema>;

/**
 * A stored or default suggestion: the model's shape, except a default may leave the distance open
 * (`totalDistanceM: null`). Every `CoachingSuggestion` is a `SuggestedSession`.
 */
export const SuggestedSessionSchema = CoachingSuggestionSchema.extend({
  totalDistanceM: z.number().int().nullable(),
});

export type SuggestedSession = z.infer<typeof SuggestedSessionSchema>;
