import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/db/database.types";
import { SessionTypeSchema } from "@/lib/services/coaching/schema";
import { BOATS, type Boat, type RowerGoal, type RowerProfile, type SessionType } from "@/types";

export interface ProfileAndGoals {
  /** null when the rower has never saved a profile. */
  profile: RowerProfile | null;
  goals: Partial<Record<SessionType, RowerGoal>>;
}

function isBoat(value: string | null): value is Boat {
  return value !== null && (BOATS as readonly string[]).includes(value);
}

/** Reads the signed-in rower's profile and goals as that user (RLS limits rows to their own). */
export async function loadProfileAndGoals(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ProfileAndGoals> {
  const [profileResult, goalsResult] = await Promise.all([
    supabase.from("profiles").select("birth_year, weight_kg, boat").eq("user_id", userId).maybeSingle(),
    supabase.from("goals").select("session_type, distance_m, target_seconds, event_date").eq("user_id", userId),
  ]);

  if (profileResult.error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[profile/load] profile read failed — ${profileResult.error.code}: ${profileResult.error.message}`);
  }
  if (goalsResult.error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[profile/load] goals read failed — ${goalsResult.error.code}: ${goalsResult.error.message}`);
  }

  const row = profileResult.data;
  const profile: RowerProfile | null = row
    ? { birthYear: row.birth_year, weightKg: row.weight_kg, boat: isBoat(row.boat) ? row.boat : null }
    : null;

  const goals: ProfileAndGoals["goals"] = {};
  for (const goal of goalsResult.data ?? []) {
    const sessionType = SessionTypeSchema.safeParse(goal.session_type);
    if (!sessionType.success) continue;
    goals[sessionType.data] = {
      sessionType: sessionType.data,
      distanceM: goal.distance_m,
      targetSeconds: goal.target_seconds,
      eventDate: goal.event_date,
    };
  }

  return { profile, goals };
}

/** Whole years since the birth year, or null when unknown. */
export function ageFromBirthYear(birthYear: number | null, now = new Date()): number | null {
  return birthYear === null ? null : now.getFullYear() - birthYear;
}
