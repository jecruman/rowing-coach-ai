import { describe, expect, it } from "vitest";

import type { RowingSession } from "@/types";

import { buildTrend, resolveTrendQuery, TREND_SIZE, trendChartGeometry } from "./trend";

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

function query(search: string, latestType: "erg" | "water" | null = null) {
  return resolveTrendQuery(new URLSearchParams(search), latestType);
}

describe("resolveTrendQuery", () => {
  it("defaults to pace and the latest session's type", () => {
    expect(query("", "water")).toEqual({ metric: "pace", type: "water" });
  });

  it("defaults to erg when there is no latest session", () => {
    expect(query("")).toEqual({ metric: "pace", type: "erg" });
  });

  it("keeps valid params", () => {
    expect(query("metric=drift&type=water", "erg")).toEqual({ metric: "drift", type: "water" });
    expect(query("metric=spm&type=erg", "water")).toEqual({ metric: "spm", type: "erg" });
  });

  it("falls back on invalid values", () => {
    expect(query("metric=watts&type=bike", "water")).toEqual({ metric: "pace", type: "water" });
  });

  it("forces water for DPS", () => {
    expect(query("metric=dps&type=erg", "erg")).toEqual({ metric: "dps", type: "water" });
    expect(query("metric=dps")).toEqual({ metric: "dps", type: "water" });
  });
});

describe("buildTrend", () => {
  it("orders oldest → newest, breaking same-date ties by insert time", () => {
    const evening = erg("2026-10-02", { createdAt: "2026-10-02T18:00:00.000000+00:00", durationS: 1150 });
    const morning = erg("2026-10-02", { createdAt: "2026-10-02T08:00:00.000000+00:00", durationS: 1180 });
    const earlier = erg("2026-10-01");
    const trend = buildTrend([evening, earlier, morning], "pace", "erg");
    expect(trend.points.map((point) => point.sessionId)).toEqual([earlier.id, morning.id, evening.id]);
    expect(trend.points.map((point) => point.value)).toEqual([120, 118, 115]);
  });

  it("drops sessions without the metric (single-split drift, missing SPM)", () => {
    const sessions = [
      erg("2026-10-01", { splitsS: [120], spm: null }),
      erg("2026-10-02", { splitsS: null }),
      erg("2026-10-03", { splitsS: [120, 123] }),
    ];
    expect(buildTrend(sessions, "drift", "erg").points.map((point) => point.value)).toEqual([3]);
    expect(buildTrend(sessions, "spm", "erg").points).toHaveLength(2);
  });

  it("ignores sessions of the other type", () => {
    const sessions = [water("2026-10-01"), erg("2026-10-02"), water("2026-10-03")];
    const trend = buildTrend(sessions, "pace", "water");
    expect(trend.points.map((point) => point.sessionId)).toEqual([sessions[0]?.id, sessions[2]?.id]);
  });

  it(`keeps the ${String(TREND_SIZE)} newest`, () => {
    const sessions = Array.from({ length: TREND_SIZE + 3 }, (_, index) =>
      erg(`2026-09-${String(index + 1).padStart(2, "0")}`),
    );
    const trend = buildTrend(sessions, "pace", "erg");
    expect(trend.points).toHaveLength(TREND_SIZE);
    expect(trend.points[0]?.rowedOn).toBe("2026-09-04");
    expect(trend.points[TREND_SIZE - 1]?.rowedOn).toBe("2026-09-23");
  });

  it("reports latest minus first, with its sign", () => {
    const faster = buildTrend([erg("2026-10-01"), erg("2026-10-02", { durationS: 1150 })], "pace", "erg");
    expect(faster.change).toBe(-5);
    const longer = buildTrend(
      [water("2026-10-01", { dps: { min: 8, max: 8 } }), water("2026-10-02", { dps: { min: 8.3, max: 8.3 } })],
      "dps",
      "water",
    );
    expect(longer.change).toBe(0.3);
  });

  it("has no change below 2 points", () => {
    expect(buildTrend([erg("2026-10-01")], "pace", "erg")).toEqual({
      points: [expect.objectContaining({ value: 120 })],
      change: null,
    });
    expect(buildTrend([], "pace", "erg")).toEqual({ points: [], change: null });
  });

  it("carries the stroke rate on DPS points", () => {
    const sessions = [water("2026-10-01", { spm: { min: 18, max: 19 } }), water("2026-10-02", { spm: null })];
    const trend = buildTrend(sessions, "dps", "water");
    expect(trend.points.map((point) => point.spmMid)).toEqual([18.5, null]);
  });
});

describe("trendChartGeometry", () => {
  const box = { width: 300, height: 100, padding: 10 };

  it("draws a flat series at mid-height", () => {
    const geometry = trendChartGeometry([120, 120, 120], { ...box, invert: false });
    expect(geometry.points).toBe("10,50 150,50 290,50");
    expect(geometry).toMatchObject({ yMin: 120, yMax: 120 });
  });

  it("puts two points at the padding edges, higher values higher", () => {
    expect(trendChartGeometry([8, 9], { ...box, invert: false })).toEqual({ points: "10,90 290,10", yMin: 8, yMax: 9 });
  });

  it("puts lower values higher when inverted (pace)", () => {
    expect(trendChartGeometry([120, 115], { ...box, invert: true }).points).toBe("10,90 290,10");
  });
});
