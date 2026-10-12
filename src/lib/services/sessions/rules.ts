import { z } from "zod";

import { emptyToNull, formatTime, parseTime } from "@/lib/services/profile/rules";
import { BOATS, type Boat, type NumberRange, type RowingSession, type SessionType } from "@/types";

export { firstIssueMessage } from "@/lib/services/profile/rules";

/** `sessions.duration_s` check: at most 10 hours. */
const MAX_DURATION_S = 36_000;
/** Largest value `numeric(6,1)` (`sessions.splits_s` elements) can hold. */
const MAX_SPLIT_S = 99_999.9;
/** `sessions.splits_s` cardinality check. */
const MAX_SPLITS = 200;
/** Longest splits text accepted before parsing (200 splits of "1:02:30.5" plus separators). */
const MAX_SPLITS_TEXT = 2_400;
/** `sessions.comment` check; also the model-input limit for comments (lessons.md). */
export const MAX_COMMENT_LENGTH = 1_000;

const SPM_MIN = 10;
const SPM_MAX = 60;
const DPS_MIN = 3;
const DPS_MAX = 20;

/** A range written as `"20-24"`, `"20 – 24"` or a single value `"22"`. */
const RANGE_SEPARATOR = String.raw`\s*[-–—]\s*`;
const SPM_PATTERN = new RegExp(String.raw`^(\d{1,3})(?:${RANGE_SEPARATOR}(\d{1,3}))?$`);
const DPS_PATTERN = new RegExp(String.raw`^(\d{1,2}(?:\.\d)?)(?:${RANGE_SEPARATOR}(\d{1,2}(?:\.\d)?))?$`);

/**
 * Splits are separated by whitespace or commas. A comma counts as a separator only when the next token
 * looks like a time (`digits:`), so a decimal comma (`"1:55,5"`) stays part of its split.
 */
const SPLIT_SEPARATOR = /\s+|,(?=\s*\d+:)/;

/** Today's date plus one day as `YYYY-MM-DD` (UTC), so a rower ahead of UTC can still log "today". */
function latestAllowedDate(now = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Parses `"1:55 1:56,5, 1:57"` into seconds; null when any token is not a valid split time. */
export function parseSplits(text: string): number[] | null {
  const tokens = text
    .split(SPLIT_SEPARATOR)
    .map((token) => token.trim())
    .filter((token) => token !== "");
  const splits: number[] = [];
  for (const token of tokens) {
    const seconds = parseTime(token);
    if (seconds === null || seconds <= 0 || seconds > MAX_SPLIT_S) return null;
    splits.push(seconds);
  }
  return splits;
}

/** Parses a range or single value with the given pattern; decimal commas are accepted. Null when malformed. */
function parseRange(text: string, pattern: RegExp): NumberRange | null {
  const match = pattern.exec(text.trim().replaceAll(",", "."));
  if (!match) return null;
  // The optional second group is undefined at runtime when only one value was written.
  const [, low, high] = match as (string | undefined)[];
  const min = Number(low);
  return { min, max: high === undefined ? min : Number(high) };
}

function rangeSchema(options: {
  pattern: RegExp;
  low: number;
  high: number;
  formatMessage: string;
  boundsMessage: string;
  orderMessage: string;
}) {
  return z.string().transform((text, ctx) => {
    const range = parseRange(text, options.pattern);
    if (range === null) {
      ctx.addIssue({ code: "custom", message: options.formatMessage });
      return z.NEVER;
    }
    if (range.min < options.low || range.max > options.high) {
      ctx.addIssue({ code: "custom", message: options.boundsMessage });
      return z.NEVER;
    }
    if (range.min > range.max) {
      ctx.addIssue({ code: "custom", message: options.orderMessage });
      return z.NEVER;
    }
    return range;
  });
}

const RowedOnSchema = z
  .string({ error: "Date is required" })
  .pipe(z.iso.date({ error: "Date must be a valid date" }))
  .refine((date) => date <= latestAllowedDate(), { error: "Date cannot be in the future" });

const DistanceSchema = z
  .string({ error: "Distance is required" })
  .regex(/^\d+$/, { error: "Distance must be a whole number of metres" })
  .transform(Number)
  .refine((m) => m >= 100 && m <= 100_000, { error: "Distance must be between 100 and 100000 m" });

const TimeSchema = z.string({ error: "Time is required" }).transform((text, ctx) => {
  const seconds = parseTime(text);
  if (seconds === null || seconds <= 0) {
    ctx.addIssue({ code: "custom", message: "Time must look like 7:30, 1:55.5 or 1:02:30" });
    return z.NEVER;
  }
  if (seconds > MAX_DURATION_S) {
    ctx.addIssue({ code: "custom", message: "Time must be at most 10 hours" });
    return z.NEVER;
  }
  return seconds;
});

const SplitsSchema = z
  .string()
  .max(MAX_SPLITS_TEXT, { error: "Too many splits" })
  .transform((text, ctx) => {
    const splits = parseSplits(text);
    if (splits === null) {
      ctx.addIssue({ code: "custom", message: "Splits must be times like 1:55 or 1:55.5, separated by spaces" });
      return z.NEVER;
    }
    if (splits.length > MAX_SPLITS) {
      ctx.addIssue({ code: "custom", message: `At most ${MAX_SPLITS} splits` });
      return z.NEVER;
    }
    return splits;
  });

const SpmSchema = rangeSchema({
  pattern: SPM_PATTERN,
  low: SPM_MIN,
  high: SPM_MAX,
  formatMessage: 'Stroke rate must be a whole number or a range like "20-24"',
  boundsMessage: `Stroke rate must be between ${SPM_MIN} and ${SPM_MAX} spm`,
  orderMessage: "Stroke rate range must go from low to high",
});

const DpsSchema = rangeSchema({
  pattern: DPS_PATTERN,
  low: DPS_MIN,
  high: DPS_MAX,
  formatMessage: 'Distance per stroke must be a number or a range like "8.5-9"',
  boundsMessage: `Distance per stroke must be between ${DPS_MIN} and ${DPS_MAX} m`,
  orderMessage: "Distance per stroke range must go from low to high",
});

const WattsSchema = z
  .string()
  .regex(/^\d+$/, { error: "Watts must be a whole number" })
  .transform(Number)
  .refine((w) => w >= 1 && w <= 2000, { error: "Watts must be between 1 and 2000" });

const BoatSchema = z.enum(BOATS, { error: "Choose a boat from the list" });

const CommentSchema = z.string().max(MAX_COMMENT_LENGTH, {
  error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters`,
});

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToNull, schema.nullable());
const required = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToNull, schema);

/** Fields both session types share. */
const commonFields = {
  rowedOn: required(RowedOnSchema),
  distanceM: required(DistanceSchema),
  time: required(TimeSchema),
  splits: optional(SplitsSchema),
  spm: optional(SpmSchema),
  comment: optional(CommentSchema),
};

/** Unknown keys are stripped, so water-only fields sent with an erg session are ignored (and vice versa). */
const ErgInputSchema = z.object({
  sessionType: z.literal("erg"),
  ...commonFields,
  watts: optional(WattsSchema),
});

const WaterInputSchema = z.object({
  sessionType: z.literal("water"),
  ...commonFields,
  dps: optional(DpsSchema),
  boat: optional(BoatSchema),
});

/** Normalised session values; each field matches a `sessions` column check. */
export interface SessionInput {
  sessionType: SessionType;
  rowedOn: string;
  distanceM: number;
  durationS: number;
  splitsS: number[] | null;
  spm: NumberRange | null;
  dps: NumberRange | null;
  watts: number | null;
  boat: Boat | null;
  comment: string | null;
}

/**
 * Session log form (all values as form strings) → normalised `SessionInput`.
 * `time` becomes `durationS`, `splits` becomes `splitsS`; fields of the other session type are ignored.
 */
export const SessionInputSchema = z
  .discriminatedUnion("sessionType", [ErgInputSchema, WaterInputSchema], {
    error: "Choose erg or water",
  })
  .transform((input): SessionInput => {
    const common = {
      rowedOn: input.rowedOn,
      distanceM: input.distanceM,
      durationS: input.time,
      splitsS: input.splits,
      spm: input.spm,
      comment: input.comment,
    };
    return input.sessionType === "erg"
      ? { sessionType: "erg", ...common, dps: null, watts: input.watts, boat: null }
      : { sessionType: "water", ...common, dps: input.dps, watts: null, boat: input.boat };
  });

/** The session form fields as `SessionInputSchema` input; missing fields come through as null. */
export function sessionFormFields(form: FormData): Record<keyof SessionFormValues, FormDataEntryValue | null> {
  return {
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
  };
}

/** `sessions` columns written by both insert and update (everything the rower can enter). */
export function toSessionColumns(session: SessionInput) {
  return {
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
  };
}

/** The session form's values as typed (all strings); the shape `SessionInputSchema` parses. */
export interface SessionFormValues {
  sessionType: SessionType;
  rowedOn: string;
  distanceM: string;
  time: string;
  splits: string;
  spm: string;
  dps: string;
  watts: string;
  boat: string;
  comment: string;
}

function rangeText(range: NumberRange | null): string {
  if (range === null) return "";
  return range.min === range.max ? String(range.min) : `${String(range.min)}-${String(range.max)}`;
}

/**
 * A stored session as form values, for the edit form. Parsing the result with `SessionInputSchema` gives back the
 * session's values, so saving an untouched edit form changes nothing.
 */
export function toSessionFormValues(session: RowingSession): SessionFormValues {
  return {
    sessionType: session.type,
    rowedOn: session.rowedOn,
    distanceM: String(session.distanceM),
    time: formatTime(session.durationS),
    splits: session.splitsS ? session.splitsS.map(formatTime).join(" ") : "",
    spm: rangeText(session.spm),
    dps: rangeText(session.dps),
    watts: session.watts === null ? "" : String(session.watts),
    boat: session.boat ?? "",
    comment: session.comment ?? "",
  };
}

function sameRange(a: NumberRange | null, b: NumberRange | null): boolean {
  return a === null || b === null ? a === b : a.min === b.min && a.max === b.max;
}

function sameSplits(a: number[] | null, b: number[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((split, i) => split === b[i]);
}

/** Browsers submit textarea line breaks as CRLF; a comment stored with LF is the same text. */
function normaliseNewlines(text: string | null): string | null {
  return text === null ? null : text.replaceAll("\r\n", "\n");
}

/** Whether saving `input` would change any stored value of `stored` (used to skip no-op updates). */
export function sessionInputChanged(stored: RowingSession, input: SessionInput): boolean {
  return !(
    stored.type === input.sessionType &&
    stored.rowedOn === input.rowedOn &&
    stored.distanceM === input.distanceM &&
    stored.durationS === input.durationS &&
    sameSplits(stored.splitsS, input.splitsS) &&
    sameRange(stored.spm, input.spm) &&
    sameRange(stored.dps, input.dps) &&
    stored.watts === input.watts &&
    stored.boat === input.boat &&
    normaliseNewlines(stored.comment) === normaliseNewlines(input.comment)
  );
}
