import type { APIRoute } from "astro";

import { isCoachingAllowed } from "@/lib/services/coaching/allowlist";
import { coachModel, createCoachingClient } from "@/lib/services/coaching/client";
import { buildCoachingContext, getCoachingSuggestion } from "@/lib/services/coaching/getCoachingSuggestion";
import { safeDefaultFor } from "@/lib/services/coaching/limits";
import type { SuggestionPayload } from "@/lib/services/coaching/schema";
import { loadProfileAndGoals } from "@/lib/services/profile/load";
import {
  loadSession,
  loadSessionsUpTo,
  loadStoredSuggestion,
  storedSuggestionPayload,
} from "@/lib/services/sessions/load";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/** Same history window as the session page, so the limits match the analysis the rower sees. */
const HISTORY_LIMIT = 30;
/** Overall deadline for the agent; on expiry it returns the clamped safe default (`model_failed`), which is stored. */
const AGENT_DEADLINE_MS = 90_000;
/** Postgres unique violation: a suggestion was stored for this session in the meantime. */
const UNIQUE_VIOLATION = "23505";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function serverError(): Response {
  return json({ error: "Could not prepare a suggestion. Please try again." }, 500);
}

function logFailure(what: string, error: { code: string; message: string }) {
  // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
  console.error(`[api/sessions/suggestion] ${what} failed — ${error.code}: ${error.message}`);
}

/**
 * Logs which safe default was returned, so `wrangler tail` shows when the model was not asked (e.g. a missing
 * `COACH_EMAILS` secret) instead of a default passing for a real suggestion. No user data.
 */
function logDefault(reason: string) {
  // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
  console.warn(`[api/sessions/suggestion] safe default: ${reason}`);
}

/**
 * Returns the suggested next session for one of the signed-in rower's sessions: the stored one, or a new one from
 * the coaching agent (stored), or an unstored safe default when the rower is not allowlisted or no key is set.
 * The request body is ignored; the only input is the session id, which the loaders validate as a uuid.
 */
export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
      return json({ error: "Not signed in" }, 401);
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
      console.error("[api/sessions/suggestion] Supabase is not configured");
      return serverError();
    }

    const id = context.params.id ?? "";
    const { session, loadFailed } = await loadSession(supabase, id);
    if (loadFailed) return serverError();
    // Not found and "belongs to someone else" look the same: RLS hides other users' rows.
    if (!session) return json({ error: "Session not found" }, 404);

    const existing = await loadStoredSuggestion(supabase, session.id);
    if (existing.loadFailed) return serverError();
    if (existing.stored) {
      const payload = storedSuggestionPayload(existing.stored);
      return payload ? json(payload, 200) : serverError();
    }

    // A failed history or goals read would loosen the limits (smaller baseline, "must be easy" never triggered),
    // so it fails the request instead of coaching from partial data.
    const [history, profileAndGoals] = await Promise.all([
      loadSessionsUpTo(supabase, session, HISTORY_LIMIT),
      loadProfileAndGoals(supabase, user.id),
    ]);
    if (history.loadFailed || profileAndGoals.loadFailed) return serverError();

    const coachingContext = buildCoachingContext(
      session,
      history.sessions,
      profileAndGoals.profile,
      profileAndGoals.goals,
    );

    if (!isCoachingAllowed(user.email)) {
      logDefault("not_allowed");
      const payload: SuggestionPayload = {
        suggestion: safeDefaultFor(session.type, coachingContext.limits),
        isDefault: true,
        defaultReason: "not_allowed",
        stored: false,
      };
      return json(payload, 200);
    }

    const client = createCoachingClient();
    if (!client) {
      logDefault("not_configured");
      const payload: SuggestionPayload = {
        suggestion: safeDefaultFor(session.type, coachingContext.limits),
        isDefault: true,
        defaultReason: "not_configured",
        stored: false,
      };
      return json(payload, 200);
    }

    const result = await getCoachingSuggestion(coachingContext, {
      client,
      model: coachModel,
      signal: AbortSignal.timeout(AGENT_DEADLINE_MS),
    });

    if (result.aborted) {
      logDefault("model_failed (deadline, not stored)");
      // Hitting the deadline says the model was slow, not that it broke a limit: show the safe default but don't
      // store it, so a reload asks again instead of locking this session to the default.
      const payload: SuggestionPayload = {
        suggestion: result.suggestion,
        isDefault: true,
        defaultReason: "model_failed",
        stored: false,
      };
      return json(payload, 200);
    }

    if (result.isDefault) logDefault(`model_failed after ${String(result.attempts)} attempts`);

    const { error } = await supabase.from("coach_suggestions").insert({
      user_id: user.id,
      session_id: session.id,
      suggestion: result.suggestion,
      is_default: result.isDefault,
      default_reason: result.defaultReason,
      attempts: result.attempts,
      model: result.model,
    });

    if (error) {
      if (error.code !== UNIQUE_VIOLATION) {
        logFailure("insert", error);
        return serverError();
      }
      // A parallel request stored one first; the stored row wins so every view shows the same suggestion.
      const reread = await loadStoredSuggestion(supabase, session.id);
      const payload = reread.stored ? storedSuggestionPayload(reread.stored) : null;
      if (!payload) {
        // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
        console.error("[api/sessions/suggestion] stored suggestion re-read failed after a unique conflict");
        return serverError();
      }
      return json(payload, 200);
    }

    const payload: SuggestionPayload = {
      suggestion: result.suggestion,
      isDefault: result.isDefault,
      defaultReason: result.defaultReason,
      stored: true,
    };
    return json(payload, 200);
  } catch (error) {
    // Only the error class: messages from libraries can embed upstream response bodies.
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
    console.error(
      `[api/sessions/suggestion] unexpected error — ${error instanceof Error ? error.name : "unknown error"}`,
    );
    return serverError();
  }
};
