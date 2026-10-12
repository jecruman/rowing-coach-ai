import { describe, expect, it } from "vitest";

import type { RowingSession } from "@/types";

import { analyseSession, previousSessions, sessionMetrics } from "./metrics";

let nextId = 0;

/** A water session rowed on `rowedOn`; `createdAt` defaults to noon that day. */
function water(rowedOn: string, overrides: Partial<RowingSession> = {}): RowingSession {
  nextId += 1;
  return {
    id: `w${String(nextId)}`,
    type: "water",
    rowedOn,
    distanceM: 5000,
    durationS: 1200, // 2:00 /500 m
    splitsS: [118, 120, 122],
    spm: { min: 20, max: 22 },
    dps: { min: 8, max: 9 },
    watts: null,
    boat: "1x",
    comment: null,
    createdAt: `${rowedOn}T12:00:00.000000+00:00`,
    updatedAt: `${rowedOn}T12:00:00.000000+00:00`,
    ...overrides,
  };
}

function erg(rowedOn: string, overrides: Partial<RowingSession> = {}): RowingSession {
  return water(rowedOn, { type: "erg", dps: null, boat: null, watts: 200, ...overrides });
}

describe("sessionMetrics", () => {
  it("computes pace, split drift and range midpoints", () => {
    expect(sessionMetrics(water("2026-10-01"))).toEqual({
      pacePer500s: 120,
      splitDriftS: 4,
      spmMid: 21,
      dpsMid: 8.5,
    });
  });

  it("returns pace only for a distance + time session, without crashing", () => {
    const session = erg("2026-10-01", { splitsS: null, spm: null, watts: null });
    expect(sessionMetrics(session)).toEqual({ pacePer500s: 120, splitDriftS: null, spmMid: null, dpsMid: null });
  });

  it("has no split drift with a single split", () => {
    expect(sessionMetrics(water("2026-10-01", { splitsS: [120] })).splitDriftS).toBeNull();
  });

  it("rounds to 0.1", () => {
    // 2000 m in 7:01 → 105.25 s/500 m.
    const metrics = sessionMetrics(erg("2026-10-01", { distanceM: 2000, durationS: 421, splitsS: [105.1, 105.43] }));
    expect(metrics.pacePer500s).toBe(105.3);
    expect(metrics.splitDriftS).toBe(0.3);
  });
});

describe("analyseSession", () => {
  it("returns identical output for the same data twice", () => {
    const history = [water("2026-10-01"), water("2026-10-02", { durationS: 1180 })];
    const session = water("2026-10-03", { durationS: 1150, dps: { min: 8.1, max: 8.3 } });
    expect(analyseSession(session, history)).toEqual(analyseSession(session, history));
  });

  it("shows values without deltas for the first session", () => {
    const session = water("2026-10-01");
    const analysis = analyseSession(session, [session]);
    expect(analysis.baselineCount).toBe(0);
    expect(analysis.metrics.pacePer500s).toBe(120);
    expect(analysis.deltas).toEqual({ pacePer500s: null, splitDriftS: null, spmMid: null, dpsMid: null });
    expect(analysis.labels).toEqual([]);
  });

  it("compares with the average of the last 3 previous same-type sessions only", () => {
    const history = [
      water("2026-09-01", { durationS: 600 }), // 4th previous water: ignored
      water("2026-09-02", { durationS: 1150 }),
      erg("2026-09-03", { durationS: 900 }), // other type: ignored
      water("2026-09-04", { durationS: 1200 }),
      water("2026-09-05", { durationS: 1250 }),
    ];
    const session = water("2026-09-06", { durationS: 1100 });
    const analysis = analyseSession(session, [session, ...history].reverse());
    expect(analysis.baselineCount).toBe(3);
    expect(analysis.baseline.pacePer500s).toBe(120); // (115 + 120 + 125) / 3
    expect(analysis.deltas.pacePer500s).toBe(-10);
  });

  it("ignores sessions ordered after it, including same-day sessions inserted later", () => {
    const earlier = water("2026-10-01", { durationS: 1200 });
    const session = water("2026-10-02", { createdAt: "2026-10-02T08:00:00.000000+00:00" });
    const sameDayLater = water("2026-10-02", { createdAt: "2026-10-02T18:00:00.000000+00:00", durationS: 600 });
    const nextDay = water("2026-10-03", { durationS: 600 });

    const withLater = analyseSession(session, [nextDay, sameDayLater, session, earlier]);
    const withoutLater = analyseSession(session, [session, earlier]);
    expect(withLater).toEqual(withoutLater);
    expect(withLater.baselineCount).toBe(1);
  });

  it("orders same-day sessions by insert time", () => {
    const morning = water("2026-10-02", { createdAt: "2026-10-02T08:00:00.000000+00:00" });
    const evening = water("2026-10-02", { createdAt: "2026-10-02T18:00:00.000000+00:00" });
    expect(previousSessions(evening, [evening, morning])).toEqual([morning]);
    expect(previousSessions(morning, [evening, morning])).toEqual([]);
  });

  it("averages each metric only over baseline sessions that have it", () => {
    const history = [water("2026-10-01", { dps: null }), water("2026-10-02", { dps: { min: 9, max: 9 } })];
    const session = water("2026-10-03", { dps: { min: 8.5, max: 8.5 } });
    const analysis = analyseSession(session, history);
    expect(analysis.baselineCount).toBe(2);
    expect(analysis.baseline.dpsMid).toBe(9);
    expect(analysis.deltas.dpsMid).toBe(-0.5);
  });

  it("has null deltas when the session lacks the metric", () => {
    const session = water("2026-10-02", { spm: null, splitsS: null });
    const analysis = analyseSession(session, [water("2026-10-01")]);
    expect(analysis.deltas.spmMid).toBeNull();
    expect(analysis.deltas.splitDriftS).toBeNull();
    expect(analysis.deltas.pacePer500s).toBe(0);
  });

  describe("labels at the decided boundaries", () => {
    // Baseline DPS midpoint 8.5; float-prone values (8.2 − 8.5 = −0.29999…) must still hit the threshold.
    const baseline = water("2026-10-01", { dps: { min: 8.5, max: 8.5 } });

    function labelsFor(overrides: Partial<RowingSession>) {
      return analyseSession(water("2026-10-02", overrides), [baseline]).labels;
    }

    it("DPS −0.3 m → clear drop", () => {
      expect(labelsFor({ dps: { min: 8.2, max: 8.2 } })).toContain("dpsClearDrop");
    });

    it("DPS −0.2 m → no label", () => {
      expect(labelsFor({ dps: { min: 8.3, max: 8.3 } })).toEqual([]);
    });

    it("DPS +0.5 m → huge improvement", () => {
      expect(labelsFor({ dps: { min: 9, max: 9 } })).toEqual(["dpsHugeImprovement"]);
    });

    it("DPS +0.4 m → no label", () => {
      expect(labelsFor({ dps: { min: 8.9, max: 8.9 } })).toEqual([]);
    });

    it("pace −5 s → good improvement", () => {
      // 1150 s over 5000 m → 115 s/500 m vs 120.
      expect(labelsFor({ durationS: 1150, dps: { min: 8.5, max: 8.5 } })).toEqual(["paceGoodImprovement"]);
    });

    it("pace −4.9 s → no label", () => {
      expect(labelsFor({ durationS: 1151, dps: { min: 8.5, max: 8.5 } })).toEqual([]);
    });

    it("pace improved while DPS clearly dropped → technique may be limiting efficiency", () => {
      expect(labelsFor({ durationS: 1190, dps: { min: 8.2, max: 8.2 } })).toEqual([
        "dpsClearDrop",
        "techniqueLimitingEfficiency",
      ]);
    });

    it("pace unchanged while DPS clearly dropped → no technique verdict", () => {
      expect(labelsFor({ dps: { min: 8.2, max: 8.2 } })).toEqual(["dpsClearDrop"]);
    });
  });
});
