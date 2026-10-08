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
