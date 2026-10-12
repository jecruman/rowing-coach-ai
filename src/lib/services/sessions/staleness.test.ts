import { describe, expect, it } from "vitest";

import { editedAfterSuggestion } from "./staleness";

const T0 = "2026-10-11T10:00:00.000000+00:00";
const T1 = "2026-10-11T10:00:30.000000+00:00";
const T2 = "2026-10-11T10:02:00.000000+00:00";

describe("editedAfterSuggestion", () => {
  it("is false when the session was not touched after the suggestion was built from it", () => {
    expect(editedAfterSuggestion(T0, { createdAt: T1, sessionUpdatedAt: T0 })).toBe(false);
  });

  it("is true when the session was edited after the version the suggestion used", () => {
    expect(editedAfterSuggestion(T1, { createdAt: T2, sessionUpdatedAt: T0 })).toBe(true);
  });

  it("catches an edit made while the suggestion was being generated (updated before it was stored)", () => {
    // Without the recorded session version this would compare T1 with created_at T2 and miss the edit.
    expect(editedAfterSuggestion(T1, { createdAt: T2, sessionUpdatedAt: T0 })).toBe(true);
    expect(editedAfterSuggestion(T1, { createdAt: T2, sessionUpdatedAt: null })).toBe(false);
  });

  it("falls back to the suggestion's created_at for older rows", () => {
    expect(editedAfterSuggestion(T2, { createdAt: T1, sessionUpdatedAt: null })).toBe(true);
    expect(editedAfterSuggestion(T0, { createdAt: T1, sessionUpdatedAt: null })).toBe(false);
  });

  it("compares instants, not strings, across different fractional-digit formats and offsets", () => {
    expect(
      editedAfterSuggestion("2026-10-11T10:00:00.5+00:00", {
        createdAt: "2026-10-11T12:00:00.000000+02:00",
        sessionUpdatedAt: "2026-10-11T10:00:00.000000+00:00",
      }),
    ).toBe(true);
    expect(
      editedAfterSuggestion("2026-10-11T10:00:00+00:00", {
        createdAt: T2,
        sessionUpdatedAt: "2026-10-11T12:00:00.000000+02:00",
      }),
    ).toBe(false);
  });
});
