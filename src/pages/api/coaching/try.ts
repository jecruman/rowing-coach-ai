import type { APIRoute } from "astro";
import { COACH_TRY_EMAILS } from "astro:env/server";

import { coachModel, createCoachingClient } from "@/lib/services/coaching/client";
import { getCoachingSuggestion } from "@/lib/services/coaching/getCoachingSuggestion";
import type { CoachingInput } from "@/lib/services/coaching/getCoachingSuggestion";

export const prerender = false;

/**
 * Fixed sample from the PRD (US-01): water, 5000 m, 500 m splits 1:52 / 1:54 / 1:55 …,
 * SPM 28–30, DPS 8.1–8.5, goal 3:50/1000 m. Splits after the first three are illustrative fill-ins.
 */
const PRD_SAMPLE_INPUT: CoachingInput = {
  session: {
    type: "water",
    distanceMeters: 5000,
    splitsPer500m: ["1:52", "1:54", "1:55", "1:55", "1:56", "1:56", "1:57", "1:56", "1:55", "1:53"],
    spmRange: "28–30",
    dpsRange: "8.1–8.5",
  },
  goal: "3:50/1000 m",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Allowlist from `COACH_TRY_EMAILS` (comma-separated); unset means nobody is allowed. */
function isAllowed(email: string | undefined): boolean {
  if (!email || !COACH_TRY_EMAILS) {
    return false;
  }
  const allowed = COACH_TRY_EMAILS.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return allowed.includes(email.toLowerCase());
}

/** Temporary try-it endpoint for one coaching call on the deployed Worker; S-02 replaces it with the real flow. */
export const POST: APIRoute = async (context) => {
  const startedAt = Date.now();
  try {
    const user = context.locals.user;
    if (!user) {
      return json({ error: "Not signed in" }, 401);
    }
    if (!isAllowed(user.email)) {
      return json({ error: "Not allowed to use the coaching try-it endpoint" }, 403);
    }

    const client = createCoachingClient();
    if (!client) {
      return json({ error: "Coaching is not configured" }, 503);
    }

    // The request body is ignored: the call always uses the fixed PRD sample, so there is nothing to validate.
    const result = await getCoachingSuggestion(PRD_SAMPLE_INPUT, { client, model: coachModel });

    return json({ ...result, durationMs: Date.now() - startedAt }, 200);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
    console.error(`[coaching/try] unexpected error — ${message}`);
    return json({ error: "Unexpected error" }, 500);
  }
};
