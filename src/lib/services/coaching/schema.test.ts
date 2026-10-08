import { describe, expect, it } from "vitest";

import { CoachingSuggestionSchema, SuggestedSessionSchema } from "./schema";

const valid = {
  sessionType: "erg",
  structure: "6 × 2 min / 2 min rest",
  totalDistanceM: 5000,
  totalMinutes: 30,
  targets: { maxSpm: 26, spmRange: "24-26", pacePer500m: "2:05", fastestPacePer500s: 125 },
  focus: "Rhythm",
  reason: "Pace held well last session.",
  techniqueTip: "Drive with the legs first.",
};

describe("CoachingSuggestionSchema bounds", () => {
  it("accepts a sensible suggestion", () => {
    expect(CoachingSuggestionSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["zero minutes", { ...valid, totalMinutes: 0 }],
    ["negative distance", { ...valid, totalDistanceM: -100 }],
    ["rate below 10 spm", { ...valid, targets: { ...valid.targets, maxSpm: 0 } }],
    ["rate above 60 spm", { ...valid, targets: { ...valid.targets, maxSpm: 61 } }],
    ["zero pace", { ...valid, targets: { ...valid.targets, fastestPacePer500s: 0 } }],
    ["over-long reason", { ...valid, reason: "x".repeat(601) }],
    ["over-long structure", { ...valid, structure: "x".repeat(301) }],
  ])("rejects %s", (_name, answer) => {
    expect(CoachingSuggestionSchema.safeParse(answer).success).toBe(false);
  });

  it("still lets a stored default leave the distance open", () => {
    expect(SuggestedSessionSchema.safeParse({ ...valid, totalDistanceM: null }).success).toBe(true);
  });
});
