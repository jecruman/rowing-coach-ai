import { describe, expect, it } from "vitest";

import { firstIssueMessage, parseSplits, SessionInputSchema } from "./rules";

const erg = {
  sessionType: "erg",
  rowedOn: "2026-10-01",
  distanceM: "2000",
  time: "7:30",
  splits: "",
  spm: "",
  watts: "",
  comment: "",
};

const water = {
  sessionType: "water",
  rowedOn: "2026-10-01",
  distanceM: "8000",
  time: "40:00",
  splits: "",
  spm: "",
  dps: "",
  boat: "",
  comment: "",
};

function parse(input: Record<string, unknown>) {
  return SessionInputSchema.safeParse(input);
}

function errorOf(input: Record<string, unknown>): string {
  const result = parse(input);
  expect(result.success).toBe(false);
  return result.success ? "" : firstIssueMessage(result.error);
}

describe("parseSplits", () => {
  it.each([
    ["1:55 1:56 1:57", [115, 116, 117]],
    ["1:55,1:56", [115, 116]],
    ["1:55, 1:56.5\n1:57", [115, 116.5, 117]],
    ["1:55,5 1:56,0", [115.5, 116]],
    ["1:55,5,1:56", [115.5, 116]],
    ["  1:55  ", [115]],
  ])("parses %j", (text, splits) => {
    expect(parseSplits(text)).toEqual(splits);
  });

  it.each(["1:55 abc", "1:75", "1:55 0:00", "115"])("rejects %j", (text) => {
    expect(parseSplits(text)).toBeNull();
  });
});

describe("SessionInputSchema", () => {
  it("accepts a distance + time only erg session", () => {
    const result = parse(erg);
    expect(result.success && result.data).toEqual({
      sessionType: "erg",
      rowedOn: "2026-10-01",
      distanceM: 2000,
      durationS: 450,
      splitsS: null,
      spm: null,
      dps: null,
      watts: null,
      boat: null,
      comment: null,
    });
  });

  it("normalises a full erg session", () => {
    const result = parse({
      ...erg,
      time: "7:30,5",
      splits: "1:52.0 1:53 1:53,5 1:51",
      spm: "24-26",
      watts: "230",
      comment: "  felt strong  ",
    });
    expect(result.success && result.data).toMatchObject({
      durationS: 450.5,
      splitsS: [112, 113, 113.5, 111],
      spm: { min: 24, max: 26 },
      watts: 230,
      comment: "felt strong",
    });
  });

  it("normalises a full water session", () => {
    const result = parse({ ...water, spm: "20 – 22", dps: "8,5-9,1", boat: "1x" });
    expect(result.success && result.data).toMatchObject({
      sessionType: "water",
      spm: { min: 20, max: 22 },
      dps: { min: 8.5, max: 9.1 },
      boat: "1x",
      watts: null,
    });
  });

  it("stores a single SPM or DPS value as min = max", () => {
    const result = parse({ ...water, spm: "22", dps: "9" });
    expect(result.success && result.data).toMatchObject({ spm: { min: 22, max: 22 }, dps: { min: 9, max: 9 } });
  });

  it("ignores water-only fields on an erg session", () => {
    const result = parse({ ...erg, dps: "garbage", boat: "not-a-boat" });
    expect(result.success && result.data).toMatchObject({ dps: null, boat: null });
  });

  it("ignores erg-only fields on a water session", () => {
    const result = parse({ ...water, watts: "999999" });
    expect(result.success && result.data).toMatchObject({ watts: null });
  });

  it.each([
    [{ ...erg, sessionType: "bike" }, "Choose erg or water"],
    [{ ...erg, rowedOn: "" }, "Date is required"],
    [{ ...erg, rowedOn: "2026-13-01" }, "Date must be a valid date"],
    [{ ...erg, rowedOn: "2999-01-01" }, "Date cannot be in the future"],
    [{ ...erg, distanceM: "" }, "Distance is required"],
    [{ ...erg, distanceM: "99" }, "Distance must be between 100 and 100000 m"],
    [{ ...erg, distanceM: "100001" }, "Distance must be between 100 and 100000 m"],
    [{ ...erg, distanceM: "2000.5" }, "Distance must be a whole number of metres"],
    [{ ...erg, time: "" }, "Time is required"],
    [{ ...erg, time: "7:75" }, "Time must look like 7:30, 1:55.5 or 1:02:30"],
    [{ ...erg, time: "0:00" }, "Time must look like 7:30, 1:55.5 or 1:02:30"],
    [{ ...erg, time: "10:00:00.1" }, "Time must be at most 10 hours"],
    [{ ...erg, splits: "1:55 nope" }, "Splits must be times like 1:55 or 1:55.5, separated by spaces"],
    [{ ...erg, splits: Array.from({ length: 201 }, () => "1:55").join(" ") }, "At most 200 splits"],
    [{ ...erg, spm: "9" }, "Stroke rate must be between 10 and 60 spm"],
    [{ ...erg, spm: "20-61" }, "Stroke rate must be between 10 and 60 spm"],
    [{ ...erg, spm: "26-24" }, "Stroke rate range must go from low to high"],
    [{ ...erg, spm: "22.5" }, 'Stroke rate must be a whole number or a range like "20-24"'],
    [{ ...erg, watts: "0" }, "Watts must be between 1 and 2000"],
    [{ ...erg, watts: "2001" }, "Watts must be between 1 and 2000"],
    [{ ...water, dps: "2.9" }, "Distance per stroke must be between 3 and 20 m"],
    [{ ...water, dps: "9-8" }, "Distance per stroke range must go from low to high"],
    [{ ...water, dps: "8.55" }, 'Distance per stroke must be a number or a range like "8.5-9"'],
    [{ ...water, boat: "3x" }, "Choose a boat from the list"],
    [{ ...erg, comment: "x".repeat(1001) }, "Comment must be at most 1000 characters"],
  ])("rejects %j", (input, message) => {
    expect(errorOf(input)).toBe(message);
  });

  it("accepts the boundary values the database allows", () => {
    const result = parse({
      ...water,
      distanceM: "100000",
      time: "10:00:00",
      spm: "10-60",
      dps: "3-20",
      comment: "x".repeat(1000),
    });
    expect(result.success).toBe(true);
  });
});
