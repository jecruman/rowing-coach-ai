import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json, Tables } from "@/db/database.types";
import { SessionTypeSchema, SuggestedSessionSchema, type SuggestionPayload } from "@/lib/services/coaching/schema";
import { BOATS, type Boat, type NumberRange, type RowingSession } from "@/types";

/** Columns every session read selects; `toRowingSession` maps exactly these. */
const SESSION_COLUMNS =
  "id, session_type, rowed_on, distance_m, duration_s, splits_s, spm_min, spm_max, dps_min, dps_max, watts, boat, comment, created_at, updated_at";

type SessionRow = Pick<
  Tables<"sessions">,
  | "id"
  | "session_type"
  | "rowed_on"
  | "distance_m"
  | "duration_s"
  | "splits_s"
  | "spm_min"
  | "spm_max"
  | "dps_min"
  | "dps_max"
  | "watts"
  | "boat"
  | "comment"
  | "created_at"
  | "updated_at"
>;

/** The stored suggestion for one session. `suggestion` is raw JSON; callers parse it with the suggestion schema. */
export interface StoredSuggestion {
  suggestion: Json;
  isDefault: boolean;
  defaultReason: "model_failed" | null;
  attempts: number;
  model: string;
  createdAt: string;
}

/** Ids are uuids; anything else cannot match a row, and PostgREST would answer it with an error. */
const SessionIdSchema = z.guid();

function isBoat(value: string | null): value is Boat {
  return value !== null && (BOATS as readonly string[]).includes(value);
}

function toRange(min: number | null, max: number | null): NumberRange | null {
  return min === null || max === null ? null : { min, max };
}

/** Maps a `sessions` row to the entity; null when the row's type is not one the app knows. */
export function toRowingSession(row: SessionRow): RowingSession | null {
  const type = SessionTypeSchema.safeParse(row.session_type);
  if (!type.success) return null;
  return {
    id: row.id,
    type: type.data,
    rowedOn: row.rowed_on,
    distanceM: row.distance_m,
    durationS: row.duration_s,
    splitsS: row.splits_s,
    spm: toRange(row.spm_min, row.spm_max),
    dps: toRange(row.dps_min, row.dps_max),
    watts: row.watts,
    boat: isBoat(row.boat) ? row.boat : null,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSessions(rows: SessionRow[] | null): RowingSession[] {
  return (rows ?? []).map(toRowingSession).filter((session): session is RowingSession => session !== null);
}

function logReadError(what: string, error: { code: string; message: string }) {
  // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; PostgREST code/message only, no user data
  console.error(`[sessions/load] ${what} read failed — ${error.code}: ${error.message}`);
}

export interface SessionResult {
  /** null when the session does not exist or belongs to someone else (RLS hides it). */
  session: RowingSession | null;
  /** true when the read failed — a null session then means "unknown", not "not found". */
  loadFailed: boolean;
}

/** Reads one session by id as the signed-in user (RLS limits rows to their own). */
export async function loadSession(supabase: SupabaseClient<Database>, id: string): Promise<SessionResult> {
  if (!SessionIdSchema.safeParse(id).success) return { session: null, loadFailed: false };

  const { data, error } = await supabase.from("sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    logReadError("session", error);
    return { session: null, loadFailed: true };
  }
  return { session: data ? toRowingSession(data) : null, loadFailed: false };
}

/** Reads the signed-in user's latest session (`rowed_on` desc, then `created_at` desc). */
export async function loadLatestSession(supabase: SupabaseClient<Database>): Promise<SessionResult> {
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .order("rowed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logReadError("latest session", error);
    return { session: null, loadFailed: true };
  }
  return { session: data ? toRowingSession(data) : null, loadFailed: false };
}

export interface SessionsPage {
  /** Up to `pageSize` sessions, newest first. */
  sessions: RowingSession[];
  /** true when at least one session is ordered after this page. */
  hasOlder: boolean;
  loadFailed: boolean;
}

/** Sessions shown per page of the session list. */
export const SESSIONS_PAGE_SIZE = 20;

/**
 * Reads one page (1-based) of the signed-in user's sessions in the agreed order (`rowed_on` desc, then `created_at`
 * desc). One extra row is requested to tell whether older sessions exist.
 */
export async function loadSessionsPage(
  supabase: SupabaseClient<Database>,
  page: number,
  pageSize = SESSIONS_PAGE_SIZE,
): Promise<SessionsPage> {
  const from = (page - 1) * pageSize;
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .order("rowed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize);
  if (error) {
    logReadError("sessions page", error);
    return { sessions: [], hasOlder: false, loadFailed: true };
  }
  const rows = data;
  return { sessions: toSessions(rows.slice(0, pageSize)), hasOlder: rows.length > pageSize, loadFailed: false };
}

export interface SessionHistory {
  /**
   * Up to `limit` sessions of any type, newest first, ending with `session` itself or earlier: sessions ordered
   * after it are excluded, so its analysis and limits never change later. The first element is normally `session`;
   * everything after it is strictly earlier.
   */
  sessions: RowingSession[];
  loadFailed: boolean;
}

/**
 * Reads the user's history as of `session`: sessions up to and including it in the agreed order
 * (`rowed_on` desc, then `created_at` desc).
 */
export async function loadSessionsUpTo(
  supabase: SupabaseClient<Database>,
  session: RowingSession,
  limit = 10,
): Promise<SessionHistory> {
  // Earlier date, or the same date and inserted no later. Values are quoted so the timestamp's `:`/`+` stay literal.
  const upTo = `rowed_on.lt."${session.rowedOn}",and(rowed_on.eq."${session.rowedOn}",created_at.lte."${session.createdAt}")`;
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .or(upTo)
    .order("rowed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logReadError("history", error);
    return { sessions: [], loadFailed: true };
  }
  return { sessions: toSessions(data), loadFailed: false };
}

export interface StoredSuggestionResult {
  /** null when no suggestion has been stored for the session yet. */
  stored: StoredSuggestion | null;
  loadFailed: boolean;
}

/** The stored suggestion as the panel payload; null (with a log line) when its JSON no longer matches the schema. */
export function storedSuggestionPayload(stored: StoredSuggestion): SuggestionPayload | null {
  const parsed = SuggestedSessionSchema.safeParse(stored.suggestion);
  if (!parsed.success) {
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`; no suggestion content logged
    console.error("[sessions/load] stored suggestion does not match the schema");
    return null;
  }
  return { suggestion: parsed.data, isDefault: stored.isDefault, defaultReason: stored.defaultReason, stored: true };
}

/** Reads the stored suggestion for one session as the signed-in user. */
export async function loadStoredSuggestion(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<StoredSuggestionResult> {
  if (!SessionIdSchema.safeParse(sessionId).success) return { stored: null, loadFailed: false };

  const { data, error } = await supabase
    .from("coach_suggestions")
    .select("suggestion, is_default, default_reason, attempts, model, created_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) {
    logReadError("suggestion", error);
    return { stored: null, loadFailed: true };
  }
  if (!data) return { stored: null, loadFailed: false };
  return {
    stored: {
      suggestion: data.suggestion,
      isDefault: data.is_default,
      defaultReason: data.default_reason === "model_failed" ? "model_failed" : null,
      attempts: data.attempts,
      model: data.model,
      createdAt: data.created_at,
    },
    loadFailed: false,
  };
}
