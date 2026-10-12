import type { APIContext, APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { loadMarkableSuggestion } from "@/lib/services/sessions/load";
import {
  firstIssueMessage,
  sessionFormFields,
  SessionInputSchema,
  toSessionColumns,
} from "@/lib/services/sessions/rules";

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

  // The done/skipped mark exists only on the log form, so it is read here and not in the shared form fields
  // (the edit endpoint parses the same fields and must never see a mark).
  const parsed = SessionInputSchema.safeParse({
    ...sessionFormFields(form),
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
    .insert({ user_id: user.id, ...toSessionColumns(session) })
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
