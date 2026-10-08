import { z } from "zod";

export const SessionTypeSchema = z.enum(["erg", "water"]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

/**
 * What the coaching call receives. Every user-written field has a length limit
 * (lessons.md: user text sent to the model must be validated and fenced).
 */
export const CoachingInputSchema = z.object({
  session: z.object({
    type: SessionTypeSchema,
    distanceMeters: z.number().positive().max(100_000).optional(),
    durationMinutes: z.number().positive().max(600).optional(),
    splitsPer500m: z.array(z.string().max(10)).max(200).optional(),
    spmRange: z.string().max(20).optional(),
    dpsRange: z.string().max(20).optional(),
    notes: z.string().max(1000).optional(),
  }),
  goal: z.string().max(200),
  comment: z.string().max(1000).optional(),
});
export type CoachingInput = z.infer<typeof CoachingInputSchema>;
export type CoachingSessionInput = CoachingInput["session"];

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

/** PRD safe default (F-01 form, no limit context): steady technique row, 35 min, max 22 spm, focus on long strokes. */
export function safeDefaultSuggestion(sessionType: SessionType): SuggestedSession {
  return {
    sessionType,
    structure: "Steady technique row, 30–40 min continuous",
    totalDistanceM: null,
    totalMinutes: 35,
    targets: {
      maxSpm: 22,
      fastestPacePer500s: null,
    },
    focus: "Long strokes",
    reason: "A safe, steady session while a personalised suggestion is unavailable.",
    techniqueTip: "Lengthen each stroke: full reach at the catch and a complete finish before the recovery.",
  };
}
