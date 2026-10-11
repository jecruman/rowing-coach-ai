import type { APIContext, APIRoute } from "astro";

import { loadSession } from "@/lib/services/sessions/load";
import {
  firstIssueMessage,
  sessionFormFields,
  sessionInputChanged,
  SessionInputSchema,
  toSessionColumns,
} from "@/lib/services/sessions/rules";
import { createClient } from "@/lib/supabase";

export const prerender = false;

function errorRedirect(context: APIContext, id: string, message: string): Response {
  return context.redirect(`/sessions/${id}/edit?error=${encodeURIComponent(message)}`);
}

/**
 * Saves an edited session for the signed-in rower and returns to its page. The session type cannot change, and an
 * unchanged form writes nothing, so `updated_at` (which marks a stored suggestion as made before an edit) only moves
 * when a value really changed.
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/sessions");
  }

  const id = context.params.id ?? "";
  const { session, loadFailed } = await loadSession(supabase, id);
  if (loadFailed) {
    return errorRedirect(context, id, "Could not load this session. Please try again.");
  }
  // Not found and "belongs to someone else" look the same: RLS hides other users' rows.
  if (!session) {
    return context.redirect("/sessions");
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return errorRedirect(context, session.id, "Invalid form submission");
  }

  const parsed = SessionInputSchema.safeParse(sessionFormFields(form));
  if (!parsed.success) {
    return errorRedirect(context, session.id, firstIssueMessage(parsed.error));
  }
  if (parsed.data.sessionType !== session.type) {
    return errorRedirect(context, session.id, "Session type can't be changed — delete the session and log it again");
  }

  if (sessionInputChanged(session, parsed.data)) {
    const { data, error } = await supabase
      .from("sessions")
      .update(toSessionColumns(parsed.data))
      .eq("id", session.id)
      .select("id");
    if (error) {
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
      console.error(`[api/sessions/id] update failed — ${error.code}: ${error.message}`);
      return errorRedirect(context, session.id, "Could not save your changes. Please try again.");
    }
    // Deleted in the meantime: nothing left to show.
    if (data.length === 0) {
      return context.redirect("/sessions");
    }
  }

  return context.redirect(`/sessions/${session.id}`);
};
