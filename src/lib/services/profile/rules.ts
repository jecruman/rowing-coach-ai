import { z } from "zod";

import { SessionTypeSchema } from "@/lib/services/coaching/schema";
import { BOATS } from "@/types";

/** `m:ss`, `m:ss.d`, `h:mm:ss` or `h:mm:ss.d`; seconds (and minutes after hours) must be 00–59. */
const TIME_PATTERN = /^\d+(?::[0-5]\d){1,2}(?:\.\d)?$/;

/** Largest value `numeric(7,1)` can hold. */
const MAX_SECONDS = 999_999.9;

/** Accepts a decimal comma (`"70,5"`, `"1:55,5"`) by turning the first `,` into `.`; any further comma stays and fails validation. */
function normaliseDecimalComma(text: string): string {
  return text.replace(",", ".");
}

/**
 * Parses a typed time into seconds: `"3:50"` → 230, `"1:55.5"` (or `"1:55,5"`) → 115.5, `"1:02:30"` → 3750.
 * Returns null for empty, negative or non-numeric input, seconds ≥ 60, or more than one decimal digit.
 */
export function parseTime(text: string): number | null {
  const trimmed = normaliseDecimalComma(text.trim());
  if (!TIME_PATTERN.test(trimmed)) return null;

  const dot = trimmed.indexOf(".");
  const clock = dot === -1 ? trimmed : trimmed.slice(0, dot);
  const tenth = dot === -1 ? 0 : Number(trimmed.slice(dot + 1));
  const wholeSeconds = clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  return (wholeSeconds * 10 + tenth) / 10;
}

/** Formats seconds for display, the inverse of `parseTime`: 230 → `"3:50"`, 115.5 → `"1:55.5"`, 3750 → `"1:02:30"`. */
export function formatTime(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const fraction = tenths % 10;
  const whole = (tenths - fraction) / 10;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;

  const ss = String(s).padStart(2, "0") + (fraction === 0 ? "" : `.${String(fraction)}`);
  return h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${ss}` : `${String(m)}:${ss}`;
}

/** Pace per 500 m in seconds: 1000 m in 230 s → 115 (`"1:55"`). */
export function pacePer500(distanceM: number, targetSeconds: number): number {
  return (targetSeconds * 500) / distanceM;
}

/** Form value → trimmed string, or null when missing or blank. */
export function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

const BirthYearSchema = z
  .string()
  .regex(/^\d{4}$/, { error: "Birth year must be a four-digit year" })
  .transform(Number)
  .refine((year) => year >= 1900 && year <= new Date().getFullYear(), {
    error: "Birth year must be between 1900 and this year",
  });

const WeightSchema = z
  .string()
  .overwrite(normaliseDecimalComma)
  .regex(/^\d{1,3}(?:\.\d)?$/, { error: "Weight must be a number with at most one decimal" })
  .transform(Number)
  .refine((kg) => kg >= 30 && kg <= 200, { error: "Weight must be between 30 and 200 kg" });

const BoatSchema = z.enum(BOATS, { error: "Choose a boat from the list" });

/** Profile form: each field optional; blank → null. Output matches `RowerProfile`. */
export const ProfileInputSchema = z.object({
  birthYear: z.preprocess(emptyToNull, BirthYearSchema.nullable()),
  weightKg: z.preprocess(emptyToNull, WeightSchema.nullable()),
  boat: z.preprocess(emptyToNull, BoatSchema.nullable()),
});

const DistanceSchema = z
  .string({ error: "Distance is required" })
  .trim()
  .regex(/^\d+$/, { error: "Distance must be a whole number of metres" })
  .transform(Number)
  .refine((m) => m >= 100 && m <= 100_000, { error: "Distance must be between 100 and 100000 m" });

const TargetTimeSchema = z
  .string({ error: "Target time is required" })
  .refine(
    (text) => {
      const seconds = parseTime(text);
      return seconds !== null && seconds > 0 && seconds <= MAX_SECONDS;
    },
    { error: "Target time must look like 3:50, 1:55.5 or 1:02:30" },
  )
  .transform((text) => parseTime(text) ?? 0);

/** Past dates are allowed so an old goal never blocks other edits. */
const EventDateSchema = z.iso.date({ error: "Event date must be a valid date" });

/** What the goal form asks for: save (create or replace) or clear the goal of one session type. */
export const GoalActionSchema = z.enum(["save", "clear"], { error: "Unknown goal action" });
export type GoalAction = z.infer<typeof GoalActionSchema>;

/** Goal form for `action=save`. Output matches `RowerGoal` (`targetTime` becomes `targetSeconds`). */
export const GoalInputSchema = z
  .object({
    sessionType: SessionTypeSchema,
    distanceM: DistanceSchema,
    targetTime: TargetTimeSchema,
    eventDate: z.preprocess(emptyToNull, EventDateSchema.nullable()),
  })
  .transform(({ targetTime, ...rest }) => ({ ...rest, targetSeconds: targetTime }));

/** First zod issue as a short human message for an error redirect. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
