import type { APIContext, APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
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
  });
  if (!parsed.success) {
    return errorRedirect(context, firstIssueMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return errorRedirect(context, "Supabase is not configured");
  }

  const session = parsed.data;
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

  return context.redirect(`/sessions/${data.id}`);
};
