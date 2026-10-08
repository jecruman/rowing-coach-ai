import type { APIContext, APIRoute } from "astro";

import { SessionTypeSchema } from "@/lib/services/coaching/schema";
import { createClient } from "@/lib/supabase";
import { firstIssueMessage, GoalActionSchema, GoalInputSchema } from "@/lib/services/profile/rules";

export const prerender = false;

function errorRedirect(context: APIContext, message: string): Response {
  return context.redirect(`/profile?error=${encodeURIComponent(message)}`);
}

/** Creates, replaces or clears the signed-in rower's goal for one session type. */
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

  // Validate the type first: it is used in the success redirect for both actions.
  const sessionType = SessionTypeSchema.safeParse(form.get("sessionType"));
  if (!sessionType.success) {
    return errorRedirect(context, "Unknown session type");
  }
  const action = GoalActionSchema.safeParse(form.get("action"));
  if (!action.success) {
    return errorRedirect(context, firstIssueMessage(action.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return errorRedirect(context, "Supabase is not configured");
  }

  const savedRedirect = `/profile?saved=${sessionType.data}-goal`;

  if (action.data === "clear") {
    // Deleting a goal that does not exist affects no rows and is not an error.
    const { error } = await supabase.from("goals").delete().eq("user_id", user.id).eq("session_type", sessionType.data);
    if (error) {
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
      console.error(`[api/goals] delete failed — ${error.code}: ${error.message}`);
      return errorRedirect(context, "Could not clear your goal. Please try again.");
    }
    return context.redirect(savedRedirect);
  }

  const parsed = GoalInputSchema.safeParse({
    sessionType: sessionType.data,
    distanceM: form.get("distanceM"),
    targetTime: form.get("targetTime"),
    eventDate: form.get("eventDate"),
  });
  if (!parsed.success) {
    return errorRedirect(context, firstIssueMessage(parsed.error));
  }

  const { distanceM, targetSeconds, eventDate } = parsed.data;
  const { error } = await supabase.from("goals").upsert(
    {
      user_id: user.id,
      session_type: parsed.data.sessionType,
      distance_m: distanceM,
      target_seconds: targetSeconds,
      event_date: eventDate,
    },
    { onConflict: "user_id,session_type" },
  );

  if (error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[api/goals] upsert failed — ${error.code}: ${error.message}`);
    return errorRedirect(context, "Could not save your goal. Please try again.");
  }

  return context.redirect(savedRedirect);
};
