import type { APIRoute } from "astro";
import { z } from "zod";

import { createClient } from "@/lib/supabase";

export const prerender = false;

/** Ids are uuids; anything else cannot match a row. */
const SessionIdSchema = z.guid();

/**
 * Deletes one of the signed-in rower's sessions; its stored suggestion goes with it (`on delete cascade`).
 * An unknown or foreign id lands on the list like a successful delete, so the response never reveals whether
 * someone else's session exists (RLS limits the delete to the caller's own rows).
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id ?? "";
  if (!SessionIdSchema.safeParse(id).success) {
    return context.redirect("/sessions");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/sessions/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
    console.error(`[api/sessions/delete] delete failed — ${error.code}: ${error.message}`);
    return context.redirect(
      `/sessions/${id}?error=${encodeURIComponent("Could not delete this session. Please try again.")}`,
    );
  }

  return context.redirect("/sessions?deleted=1");
};
