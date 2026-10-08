import { describe, expect, it } from "vitest";

import { formatTime, GoalInputSchema, pacePer500, parseTime, ProfileInputSchema } from "./rules";

describe("parseTime", () => {
  it.each([
    ["3:50", 230],
    ["1:55.5", 115.5],
    ["1:02:30", 3750],
    ["7:30", 450],
    [" 0:59 ", 59],
  ])("parses %j as %d seconds", (text, seconds) => {
    expect(parseTime(text)).toBe(seconds);
  });

  it.each(["3:60", "abc", "", "-1:00", "1:55.55", "1:60:00", "3:5", "230", "1:02:30:00", "1:5x"])(
    "rejects %j",
    (text) => {
      expect(parseTime(text)).toBeNull();
    },
  );
});

describe("formatTime", () => {
  it.each([
    [230, "3:50"],
    [115.5, "1:55.5"],
    [3750, "1:02:30"],
    [59, "0:59"],
  ])("formats %d as %j", (seconds, text) => {
    expect(formatTime(seconds)).toBe(text);
  });

  it.each(["3:50", "1:55.5", "1:02:30", "0:05.1", "10:00"])("round-trips %j", (text) => {
    const seconds = parseTime(text);
    expect(seconds).not.toBeNull();
    expect(formatTime(seconds ?? 0)).toBe(text);
  });
});

describe("pacePer500", () => {
  it("is 115 s (1:55) for 1000 m in 230 s", () => {
    const pace = pacePer500(1000, 230);
    expect(pace).toBe(115);
    expect(formatTime(pace)).toBe("1:55");
  });
});

describe("ProfileInputSchema", () => {
  it("accepts a full profile", () => {
    expect(ProfileInputSchema.parse({ birthYear: "1990", weightKg: "82.5", boat: "1x" })).toEqual({
      birthYear: 1990,
      weightKg: 82.5,
      boat: "1x",
    });
  });

  it("accepts an empty profile as all nulls", () => {
    const empty = { birthYear: null, weightKg: null, boat: null };
    expect(ProfileInputSchema.parse({})).toEqual(empty);
    expect(ProfileInputSchema.parse({ birthYear: "", weightKg: "  ", boat: "" })).toEqual(empty);
  });

  it.each([
    ["birth year 1800", { birthYear: "1800" }],
    ["a future birth year", { birthYear: String(new Date().getFullYear() + 1) }],
    ["weight 20", { weightKg: "20" }],
    ["weight 250", { weightKg: "250" }],
    ["weight with two decimals", { weightKg: "80.25" }],
    ['boat "canoe"', { boat: "canoe" }],
  ])("rejects %s", (_label, input) => {
    const result = ProfileInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("GoalInputSchema", () => {
  const valid = { sessionType: "erg", distanceM: "2000", targetTime: "7:30" };

  it("accepts erg / 2000 / 7:30 without an event date", () => {
    expect(GoalInputSchema.parse(valid)).toEqual({
      sessionType: "erg",
      distanceM: 2000,
      targetSeconds: 450,
      eventDate: null,
    });
  });

  it("accepts a past event date", () => {
    expect(GoalInputSchema.parse({ ...valid, eventDate: "2020-05-01" }).eventDate).toBe("2020-05-01");
  });

  it.each([
    ["distance 50", { ...valid, distanceM: "50" }],
    ['time "7:75"', { ...valid, targetTime: "7:75" }],
    ["time 0:00", { ...valid, targetTime: "0:00" }],
    ['type "bike"', { ...valid, sessionType: "bike" }],
    ["an invalid event date", { ...valid, eventDate: "2026-02-30" }],
  ])("rejects %s", (_label, input) => {
    expect(GoalInputSchema.safeParse(input).success).toBe(false);
  });
});
