import { describe, expect, it } from "vitest";

import { isEmailAllowed } from "./allowlist";

describe("isEmailAllowed", () => {
  it("allows an email on the list", () => {
    expect(isEmailAllowed("rower@example.com", "coach@example.com,rower@example.com")).toBe(true);
  });

  it("matches case-insensitively and ignores spaces around entries", () => {
    expect(isEmailAllowed("Rower@Example.com", " coach@example.com , ROWER@example.com ")).toBe(true);
  });

  it("rejects an email that is not on the list", () => {
    expect(isEmailAllowed("stranger@example.com", "coach@example.com,rower@example.com")).toBe(false);
  });

  it("rejects everyone when the allowlist is unset or empty", () => {
    expect(isEmailAllowed("rower@example.com", undefined)).toBe(false);
    expect(isEmailAllowed("rower@example.com", "")).toBe(false);
    expect(isEmailAllowed("rower@example.com", " , ")).toBe(false);
  });

  it("rejects a user without an email", () => {
    expect(isEmailAllowed(undefined, "rower@example.com")).toBe(false);
  });
});
