import type { APIContext, APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { firstIssueMessage, ProfileInputSchema } from "@/lib/services/profile/rules";

export const prerender = false;

function errorRedirect(context: APIContext, message: string): Response {
  return context.redirect(`/profile?error=${encodeURIComponent(message)}`);
}

/** Creates or updates the signed-in rower's profile. */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = ProfileInputSchema.safeParse({
    birthYear: form.get("birthYear"),
    weightKg: form.get("weightKg"),
    boat: form.get("boat"),
  });
  if (!parsed.success) {
    return errorRedirect(context, firstIssueMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return errorRedirect(context, "Supabase is not configured");
  }

  const { birthYear, weightKg, boat } = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, birth_year: birthYear, weight_kg: weightKg, boat }, { onConflict: "user_id" });

  if (error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[api/profile] upsert failed — ${error.code}: ${error.message}`);
    return errorRedirect(context, "Could not save your profile. Please try again.");
  }

  return context.redirect("/profile?saved=profile");
};
