import type { APIContext, APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { loadMarkableSuggestion } from "@/lib/services/sessions/load";
import { firstIssueMessage, SessionInputSchema } from "@/lib/services/sessions/rules";

export const prerender = false;

function errorRedirect(context: APIContext, message: string): Response {
  return context.redirect(`/sessions/new?error=${encodeURIComponent(message)}`);
}

/** Logs a new session for the signed-in rower and opens its page. */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form body (e.g. JSON or missing content type) — a bad request, not a server error.
    return errorRedirect(context, "Invalid form submission");
  }

  const parsed = SessionInputSchema.safeParse({
    sessionType: form.get("sessionType"),
    rowedOn: form.get("rowedOn"),
    distanceM: form.get("distanceM"),
    time: form.get("time"),
    splits: form.get("splits"),
    spm: form.get("spm"),
    dps: form.get("dps"),
    watts: form.get("watts"),
    boat: form.get("boat"),
    comment: form.get("comment"),
    markedSuggestionId: form.get("markedSuggestionId"),
    outcome: form.get("outcome"),
  });
  if (!parsed.success) {
    return errorRedirect(context, firstIssueMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return errorRedirect(context, "Supabase is not configured");
  }

  const session = parsed.data;

  // The mark is checked before the insert, because the new session becomes the latest one. It is kept only for the
  // suggestion still stored, unmarked, on the latest session; a stale question (e.g. a newer session logged in
  // another tab) or a failed read drops the mark silently — the session itself is always saved.
  let mark = session.mark;
  if (mark) {
    const { markable } = await loadMarkableSuggestion(supabase);
    if (markable?.suggestionId !== mark.suggestionId) {
      mark = null;
    } else if (session.rowedOn < markable.rowedOn) {
      // "Done" would claim an earlier session was the suggested one.
      return errorRedirect(
        context,
        `A marked session can't be dated before the suggested session (${markable.rowedOn})`,
      );
    }
  }
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      session_type: session.sessionType,
      rowed_on: session.rowedOn,
      distance_m: session.distanceM,
      duration_s: session.durationS,
      splits_s: session.splitsS,
      spm_min: session.spm?.min ?? null,
      spm_max: session.spm?.max ?? null,
      dps_min: session.dps?.min ?? null,
      dps_max: session.dps?.max ?? null,
      watts: session.watts,
      boat: session.boat,
      comment: session.comment,
    })
    .select("id")
    .single();

  if (error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[api/sessions] insert failed — ${error.code}: ${error.message}`);
    return errorRedirect(context, "Could not save your session. Please try again.");
  }

  if (mark) {
    const { error: markError } = await supabase.from("suggestion_outcomes").insert({
      user_id: user.id,
      suggestion_id: mark.suggestionId,
      logged_session_id: data.id,
      outcome: mark.outcome,
    });
    if (markError) {
      // The session is saved; the suggestion just stays unmarked (e.g. a parallel submit marked it first).
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
      console.error(`[api/sessions] mark insert failed — ${markError.code}: ${markError.message}`);
    }
  }

  return context.redirect(`/sessions/${data.id}`);
};
