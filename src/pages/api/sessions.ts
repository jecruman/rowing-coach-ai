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

/** Postgres unique violation: another submit marked this suggestion first. */
const UNIQUE_VIOLATION = "23505";

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
  // another tab) drops the mark silently. A failed read fails closed, like the suggestion endpoint: dropping a skip
  // without telling the rower would remove its no make-up cap.
  let mark = session.mark;
  if (mark) {
    const { markable, loadFailed } = await loadMarkableSuggestion(supabase);
    if (loadFailed) {
      return errorRedirect(context, "Could not save your answer about the suggested session. Please try again.");
    }
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
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
      console.error(`[api/sessions] mark insert failed — ${markError.code}: ${markError.message}`);
      // A parallel submit marking it first is fine. Otherwise the session is saved but the answer is not, so the
      // rower is told (the next suggestion will not reflect it).
      if (markError.code !== UNIQUE_VIOLATION) {
        const notice =
          "Your session was saved, but your answer about the previous suggestion wasn't, so the next suggestion can't take it into account.";
        return context.redirect(`/sessions/${data.id}?error=${encodeURIComponent(notice)}`);
      }
    }
  }

  return context.redirect(`/sessions/${data.id}`);
};
