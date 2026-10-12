import type { APIContext, APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
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

  const parsed = SessionInputSchema.safeParse(sessionFormFields(form));
  if (!parsed.success) {
    return errorRedirect(context, firstIssueMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return errorRedirect(context, "Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, ...toSessionColumns(parsed.data) })
    .select("id")
    .single();

  if (error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[api/sessions] insert failed — ${error.code}: ${error.message}`);
    return errorRedirect(context, "Could not save your session. Please try again.");
  }

  return context.redirect(`/sessions/${data.id}`);
};
