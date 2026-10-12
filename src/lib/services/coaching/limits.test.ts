import { describe, expect, it } from "vitest";

import type { RowingSession } from "@/types";

import { isHardSession, limitContext, safeDefaultFor, validateSuggestion } from "./limits";
import type { CheckedSuggestion, Goals, LimitContext } from "./limits";
import type { SuggestedSession } from "./schema";

let nextId = 0;

/** A 5000 m / 20 min (2:00 /500 m) session; `createdAt` defaults to noon that day. */
function session(type: RowingSession["type"], rowedOn: string, overrides: Partial<RowingSession> = {}): RowingSession {
  nextId += 1;
  return {
    id: `s${String(nextId)}`,
    type,
    rowedOn,
    distanceM: 5000,
    durationS: 1200,
    splitsS: null,
    spm: { min: 20, max: 22 },
    dps: type === "water" ? { min: 8.5, max: 8.5 } : null,
    watts: null,
    boat: null,
    comment: null,
    createdAt: `${rowedOn}T12:00:00.000000+00:00`,
    updatedAt: `${rowedOn}T12:00:00.000000+00:00`,
    ...overrides,
  };
}

/** Goal pace 2:00 /500 m for both types → "hard" means 2:05 /500 m (125 s) or faster. */
const goals: Goals = {
  erg: { sessionType: "erg", distanceM: 2000, targetSeconds: 480, eventDate: null },
  water: { sessionType: "water", distanceM: 1000, targetSeconds: 240, eventDate: null },
};

function suggestion(overrides: Partial<CheckedSuggestion> = {}): CheckedSuggestion {
  return {
    sessionType: "water",
    totalDistanceM: 5000,
    totalMinutes: 20,
    targets: { maxSpm: 22, fastestPacePer500s: null },
    ...overrides,
  };
}

function codes(s: CheckedSuggestion, context: LimitContext) {
  return validateSuggestion(s, context).map((v) => v.code);
}

describe("isHardSession", () => {
  it("is hard at exactly goal pace + 5 s", () => {
    expect(isHardSession(session("erg", "2026-10-01", { durationS: 1250 }), goals)).toBe(true); // 125 s/500 m
  });

  it("is not hard 0.1 s slower than goal pace + 5 s", () => {
    expect(isHardSession(session("erg", "2026-10-01", { durationS: 1251 }), goals)).toBe(false);
  });

  it("is not hard without a goal for its type", () => {
    expect(isHardSession(session("erg", "2026-10-01", { durationS: 900 }), { water: goals.water })).toBe(false);
  });
});

describe("limitContext", () => {
  it("caps the first session's next volume at 110 % of itself, with no other limits", () => {
    const first = session("water", "2026-10-01");
    const context = limitContext(first, [first], {});
    expect(context).toEqual({
      volumeCaps: { water: { distanceM: 5500, minutes: 22 } },
      maxSpmCap: null,
      mustBeEasy: false,
      easyPaceFloorS: {},
      skipCap: null,
    });
  });

  it("averages the latest 3 same-type sessions including the logged one", () => {
    const history = [
      session("water", "2026-09-01", { distanceM: 20000 }), // 4th: ignored
      session("water", "2026-09-02", { distanceM: 4000, durationS: 960 }),
      session("water", "2026-09-03", { distanceM: 5000, durationS: 1200 }),
      session("erg", "2026-09-04", { distanceM: 2000, durationS: 480 }),
    ];
    const logged = session("water", "2026-09-05", { distanceM: 6000, durationS: 1440 });
    const context = limitContext(logged, [logged, ...history], {});
    expect(context.volumeCaps).toEqual({
      water: { distanceM: 5500, minutes: 22 },
      erg: { distanceM: 2200, minutes: 8.8 },
    });
  });

  it("ignores sessions ordered after the logged one", () => {
    const earlier = session("water", "2026-10-01");
    const logged = session("water", "2026-10-02", { createdAt: "2026-10-02T08:00:00.000000+00:00" });
    const sameDayLater = session("water", "2026-10-02", {
      createdAt: "2026-10-02T18:00:00.000000+00:00",
      distanceM: 20000,
      durationS: 4000,
      dps: { min: 7, max: 7 },
    });
    const laterErg = session("erg", "2026-10-03", { durationS: 900 });
    const full = [laterErg, sameDayLater, logged, earlier];

    expect(limitContext(logged, full, goals)).toEqual(limitContext(logged, [logged, earlier], goals));
    expect(limitContext(logged, full, goals).volumeCaps.erg).toBeUndefined();
  });

  it("caps the rate at 32 after a water session with a 0.3 m DPS drop", () => {
    const previous = session("water", "2026-10-01", { dps: { min: 8.5, max: 8.5 } });
    const logged = session("water", "2026-10-02", { dps: { min: 8.2, max: 8.2 } });
    expect(limitContext(logged, [logged, previous], {}).maxSpmCap).toBe(32);
  });

  it("does not cap the rate after a 0.2 m DPS drop", () => {
    const previous = session("water", "2026-10-01", { dps: { min: 8.5, max: 8.5 } });
    const logged = session("water", "2026-10-02", { dps: { min: 8.3, max: 8.3 } });
    expect(limitContext(logged, [logged, previous], {}).maxSpmCap).toBeNull();
  });

  it("requires an easy session after two hard ones of different types (erg then water)", () => {
    const hardErg = session("erg", "2026-10-01", { durationS: 1200 });
    const hardWater = session("water", "2026-10-02", { durationS: 1240 });
    const context = limitContext(hardWater, [hardWater, hardErg], goals);
    expect(context.mustBeEasy).toBe(true);
    expect(context.easyPaceFloorS).toEqual({ erg: 125, water: 125 });
  });

  it("does not require an easy session when only the logged one was hard", () => {
    const easy = session("erg", "2026-10-01", { durationS: 1400 });
    const hard = session("water", "2026-10-02", { durationS: 1200 });
    expect(limitContext(hard, [hard, easy], goals).mustBeEasy).toBe(false);
  });

  it("treats sessions without a goal for their type as not hard", () => {
    const first = session("erg", "2026-10-01", { durationS: 900 });
    const second = session("erg", "2026-10-02", { durationS: 900 });
    expect(limitContext(second, [second, first], {}).mustBeEasy).toBe(false);
  });

  it("does not require an easy session after a single logged session", () => {
    const only = session("erg", "2026-10-01", { durationS: 900 });
    expect(limitContext(only, [only], goals).mustBeEasy).toBe(false);
  });
});

describe("validateSuggestion", () => {
  const base: LimitContext = {
    volumeCaps: { water: { distanceM: 5500, minutes: 22 } },
    maxSpmCap: null,
    mustBeEasy: false,
    easyPaceFloorS: {},
    skipCap: null,
  };

  it("accepts exactly 110 % of distance and time", () => {
    expect(codes(suggestion({ totalDistanceM: 5500, totalMinutes: 22 }), base)).toEqual([]);
  });

  it("accepts exactly 110 % when the cap comes from float arithmetic", () => {
    // 3 × 1000 m in 10 min → cap 1100 m / 11 min, both computed as 1.1 × average.
    const first = session("erg", "2026-10-01", { distanceM: 1000, durationS: 600 });
    const second = session("erg", "2026-10-02", { distanceM: 1000, durationS: 600 });
    const third = session("erg", "2026-10-03", { distanceM: 1000, durationS: 600 });
    const context = limitContext(third, [third, second, first], {});
    expect(codes(suggestion({ sessionType: "erg", totalDistanceM: 1100, totalMinutes: 11 }), context)).toEqual([]);
  });

  it("rejects distance and time above 110 %", () => {
    expect(codes(suggestion({ totalDistanceM: 5501, totalMinutes: 22.1 }), base)).toEqual([
      "volume_distance",
      "volume_time",
    ]);
  });

  it("skips the distance check when the suggestion has no distance", () => {
    expect(codes(suggestion({ totalDistanceM: null }), base)).toEqual([]);
  });

  it("rejects a type without a volume baseline", () => {
    const violations = validateSuggestion(suggestion({ sessionType: "erg" }), base);
    expect(violations.map((v) => v.code)).toEqual(["no_baseline_for_type"]);
    expect(violations[0]?.message).toContain("erg");
  });

  it("rejects a rate above 32 after a clear DPS drop", () => {
    const context = { ...base, maxSpmCap: 32 as const };
    expect(codes(suggestion({ targets: { maxSpm: 32, fastestPacePer500s: null } }), context)).toEqual([]);
    expect(codes(suggestion({ targets: { maxSpm: 33, fastestPacePer500s: null } }), context)).toEqual(["rate_cap"]);
  });

  describe("when the next session must be easy", () => {
    const easy: LimitContext = { ...base, mustBeEasy: true, easyPaceFloorS: { water: 125 } };

    it("accepts max 22 spm and no pace target", () => {
      expect(codes(suggestion(), easy)).toEqual([]);
    });

    it("rejects a rate above 22", () => {
      expect(codes(suggestion({ targets: { maxSpm: 23, fastestPacePer500s: null } }), easy)).toEqual(["not_easy_rate"]);
    });

    it("rejects a pace target at goal pace + 5 s and accepts one 0.1 s slower", () => {
      expect(codes(suggestion({ targets: { maxSpm: 20, fastestPacePer500s: 125 } }), easy)).toEqual(["not_easy_pace"]);
      expect(codes(suggestion({ targets: { maxSpm: 20, fastestPacePer500s: 125.1 } }), easy)).toEqual([]);
    });

    it("skips the pace check for a type without a goal", () => {
      const context: LimitContext = { ...easy, easyPaceFloorS: {} };
      expect(codes(suggestion({ targets: { maxSpm: 20, fastestPacePer500s: 90 } }), context)).toEqual([]);
    });
  });

  it("returns a human message for every violation", () => {
    const context: LimitContext = { ...base, maxSpmCap: 32, mustBeEasy: true, easyPaceFloorS: { water: 125 } };
    const violations = validateSuggestion(
      suggestion({ totalDistanceM: 9000, totalMinutes: 60, targets: { maxSpm: 34, fastestPacePer500s: 110 } }),
      context,
    );
    expect(violations.map((v) => v.code)).toEqual([
      "volume_distance",
      "volume_time",
      "rate_cap",
      "not_easy_rate",
      "not_easy_pace",
    ]);
    for (const violation of violations) expect(violation.message.length).toBeGreaterThan(20);
  });
});

describe("safeDefaultFor", () => {
  const contexts: [string, RowingSession, RowingSession[], Goals][] = (() => {
    const short = session("erg", "2026-10-01", { distanceM: 2000, durationS: 480 });
    const firstWater = session("water", "2026-10-01");
    const hardErg = session("erg", "2026-10-01", { durationS: 1200 });
    const hardWaterDrop = session("water", "2026-10-02", { durationS: 1200, dps: { min: 8, max: 8 } });
    const waterBefore = session("water", "2026-09-30", { dps: { min: 8.5, max: 8.5 } });
    const long = session("water", "2026-10-03", { distanceM: 20000, durationS: 6000 });
    const tiny = session("erg", "2026-10-01", { distanceM: 100, durationS: 20 });
    return [
      ["a short first erg session", short, [short], {}],
      ["a first water session", firstWater, [firstWater], goals],
      ["two hard sessions after a DPS drop", hardWaterDrop, [hardWaterDrop, hardErg, waterBefore], goals],
      ["a long session", long, [long], goals],
      ["a very short session", tiny, [tiny], {}],
    ];
  })();

  it.each(contexts)("passes every limit after %s", (_label, logged, history, sessionGoals) => {
    const context = limitContext(logged, history, sessionGoals);
    const fallback = safeDefaultFor(logged.type, context);
    expect(validateSuggestion(fallback, context)).toEqual([]);
    expect(fallback.sessionType).toBe(logged.type);
    expect(fallback.targets.maxSpm).toBe(22);
    expect(fallback.targets.fastestPacePer500s).toBeNull();
    expect(fallback.totalDistanceM).toBeNull();
  });

  it("passes when every limit applies at once", () => {
    const context: LimitContext = {
      volumeCaps: { erg: { distanceM: 2200, minutes: 8.8 }, water: { distanceM: 5500, minutes: 22 } },
      maxSpmCap: 32,
      mustBeEasy: true,
      easyPaceFloorS: { erg: 125, water: 125 },
      skipCap: null,
    };
    for (const type of ["erg", "water"] as const) {
      expect(validateSuggestion(safeDefaultFor(type, context), context)).toEqual([]);
    }
  });

  it("is 35 min when the time cap allows more, otherwise the cap rounded down", () => {
    const long = session("water", "2026-10-01", { durationS: 6000 });
    expect(safeDefaultFor("water", limitContext(long, [long], {})).totalMinutes).toBe(35);
    const short = session("erg", "2026-10-01", { durationS: 480 }); // cap 8.8 min
    expect(safeDefaultFor("erg", limitContext(short, [short], {})).totalMinutes).toBe(8);
  });
});

describe("no make-up rule after a skip", () => {
  /** The suggestion the rower skipped: 6 km / 30 min of water rowing. */
  function skipped(overrides: Partial<SuggestedSession> = {}): SuggestedSession {
    return {
      sessionType: "water",
      structure: "3 × 10 min / 2 min rest",
      totalDistanceM: 6000,
      totalMinutes: 30,
      targets: { maxSpm: 24, fastestPacePer500s: null },
      focus: "Rhythm",
      reason: "Build steady volume.",
      techniqueTip: "Relax the shoulders.",
      ...overrides,
    };
  }

  // Volume caps are generous (two long sessions), so only the skip cap can fire below.
  const long1 = session("water", "2026-10-01", { distanceM: 10000, durationS: 3600 });
  const long2 = session("erg", "2026-10-02", { distanceM: 10000, durationS: 3600 });
  const logged = session("water", "2026-10-03", { distanceM: 10000, durationS: 3600 });
  const history = [logged, long2, long1];

  it("sets the skip cap only from a skipped suggestion", () => {
    expect(limitContext(logged, history, {}, skipped()).skipCap).toEqual({
      sessionType: "water",
      minutes: 30,
      distanceM: 6000,
    });
    expect(limitContext(logged, history, {}).skipCap).toBeNull();
  });

  it("allows exactly the skipped suggestion's time and distance", () => {
    const context = limitContext(logged, history, {}, skipped());
    expect(codes(suggestion({ totalMinutes: 30, totalDistanceM: 6000 }), context)).toEqual([]);
  });

  it("rejects more time or more same-type distance than the skipped suggestion", () => {
    const context = limitContext(logged, history, {}, skipped());
    expect(codes(suggestion({ totalMinutes: 30.1, totalDistanceM: 6000 }), context)).toEqual(["skip_time"]);
    expect(codes(suggestion({ totalMinutes: 30, totalDistanceM: 6001 }), context)).toEqual(["skip_distance"]);
  });

  it("caps only the time when the next suggestion is another type", () => {
    const context = limitContext(logged, history, {}, skipped());
    const erg = suggestion({ sessionType: "erg", totalMinutes: 30, totalDistanceM: 9000 });
    expect(codes(erg, context)).toEqual([]);
    expect(codes({ ...erg, totalMinutes: 31 }, context)).toEqual(["skip_time"]);
  });

  it("caps only the time when the skipped suggestion had no distance", () => {
    const context = limitContext(logged, history, {}, skipped({ totalDistanceM: null }));
    expect(codes(suggestion({ totalMinutes: 30, totalDistanceM: 9000 }), context)).toEqual([]);
    expect(codes(suggestion({ totalMinutes: 31, totalDistanceM: 9000 }), context)).toEqual(["skip_time"]);
  });

  it("clamps the safe default to the skip cap", () => {
    const context = limitContext(logged, history, {}, skipped({ totalMinutes: 20.5 }));
    const fallback = safeDefaultFor("water", context);
    expect(fallback.totalMinutes).toBe(20);
    expect(validateSuggestion(fallback, context)).toEqual([]);
  });
});
