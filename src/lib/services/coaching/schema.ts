import { z } from "zod";

export const SessionTypeSchema = z.enum(["erg", "water"]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

/** One suggested next session — the shape the model must return and the safe default shares. */
export const CoachingSuggestionSchema = z.object({
  sessionType: SessionTypeSchema,
  structure: z.string().describe('Session structure, e.g. "6 × 2 min / 2 min rest".'),
  targets: z.object({
    maxSpm: z.number().optional().describe("Maximum stroke rate in strokes per minute."),
    spmRange: z.string().optional().describe('Target stroke-rate range, e.g. "20-22".'),
    pacePer500m: z.string().optional().describe('Target pace per 500 m, e.g. "2:05".'),
  }),
  focus: z.string(),
  reason: z.string(),
  techniqueTip: z.string(),
});

export type CoachingSuggestion = z.infer<typeof CoachingSuggestionSchema>;

/** PRD safe default: steady technique row, 30–40 min, max 22 spm, focus on long strokes. */
export function safeDefaultSuggestion(sessionType: SessionType): CoachingSuggestion {
  return {
    sessionType,
    structure: "Steady technique row, 30–40 min continuous",
    targets: {
      maxSpm: 22,
    },
    focus: "Long strokes",
    reason: "A safe, steady session while a personalised suggestion is unavailable.",
    techniqueTip: "Lengthen each stroke: full reach at the catch and a complete finish before the recovery.",
  };
}
