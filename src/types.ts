import type { SessionType } from "@/lib/services/coaching/schema";

export type { SessionType };

/** Boat classes a rower can pick; mirrors the `profiles.boat` check constraint. */
export const BOATS = ["1x", "2x", "2-", "4x", "4-", "8+"] as const;
export type Boat = (typeof BOATS)[number];

/** A rower's profile; every field is optional in the product, so all are nullable. */
export interface RowerProfile {
  birthYear: number | null;
  weightKg: number | null;
  boat: Boat | null;
}

/** A rower's goal for one session type: cover `distanceM` in `targetSeconds`, optionally by `eventDate` (ISO date). */
export interface RowerGoal {
  sessionType: SessionType;
  distanceM: number;
  targetSeconds: number;
  eventDate: string | null;
}

/** An inclusive range; a single logged value is stored as `min === max`. */
export interface NumberRange {
  min: number;
  max: number;
}

/** One logged rowing session. Type-specific fields are null for the other type (`dps`, `boat`: water; `watts`: erg). */
export interface RowingSession {
  id: string;
  type: SessionType;
  /** ISO date the session was rowed (`YYYY-MM-DD`). */
  rowedOn: string;
  distanceM: number;
  durationS: number;
  /** Per-500 m split times in seconds, in rowing order; null when not logged. */
  splitsS: number[] | null;
  /** Stroke rate range (strokes per minute). */
  spm: NumberRange | null;
  /** Distance per stroke range (metres), water only. */
  dps: NumberRange | null;
  /** Average watts, erg only. */
  watts: number | null;
  /** Boat class, water only. */
  boat: Boat | null;
  comment: string | null;
  /** Insert timestamp; breaks ties between sessions rowed on the same date. */
  createdAt: string;
}
