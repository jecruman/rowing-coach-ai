import { formatTime, pacePer500 } from "@/lib/services/profile/rules";
import type { RowerGoal, RowingSession, SessionType } from "@/types";

import { analyseSession, BASELINE_SIZE, previousSessions, round1, sessionMetrics } from "./metrics";
import type { SuggestedSession } from "./schema";

/** Limit 1: the next session may be at most 110 % of the recent average volume. */
const VOLUME_FACTOR = 1.1;
/** Limit 2: after a clear DPS drop on water, the next session stays at or below this rate. */
const DROP_RATE_CAP = 32;
/** Limit 3: after two hard sessions, the next one stays at or below this rate... */
const EASY_MAX_SPM = 22;
/** ...and slower than goal pace plus this margin. Also the "hard" threshold. */
const HARD_PACE_MARGIN_S = 5;
/** Longest safe default, in minutes. */
const SAFE_DEFAULT_MINUTES = 35;

export type Goals = Partial<Record<SessionType, RowerGoal>>;

export interface VolumeCap {
  /** Largest allowed total distance in metres (110 % of the average, rounded to 0.1). */
  distanceM: number;
  /** Largest allowed total time (work + rest) in minutes (110 % of the average, rounded to 0.1). */
  minutes: number;
}

/** What the next suggestion must respect, derived from the session just logged and the history before it. */
export interface LimitContext {
  /** Per type with at least one session as of the logged one; a type without an entry has no baseline. */
  volumeCaps: Partial<Record<SessionType, VolumeCap>>;
  /** 32 after a water session with a clear DPS drop, otherwise no rate cap. */
  maxSpmCap: typeof DROP_RATE_CAP | null;
  /** True when the logged session and the one before it (any type) were both hard. */
  mustBeEasy: boolean;
  /** When `mustBeEasy`: per type with a goal, every pace target must be slower than this (s/500 m). Empty otherwise. */
  easyPaceFloorS: Partial<Record<SessionType, number>>;
}

export type ViolationCode =
  "volume_distance" | "volume_time" | "no_baseline_for_type" | "rate_cap" | "not_easy_rate" | "not_easy_pace";

export interface Violation {
  code: ViolationCode;
  /** Human-readable, used as retry feedback for the model. */
  message: string;
}

/** The numbers the validator checks; every `SuggestedSession` (and model `CoachingSuggestion`) has them. */
export type CheckedSuggestion = Pick<SuggestedSession, "sessionType" | "totalDistanceM" | "totalMinutes"> & {
  targets: Pick<SuggestedSession["targets"], "maxSpm" | "fastestPacePer500s">;
};

/** Goal pace for the session's type plus 5 s/500 m, rounded to 0.1; null without a goal for that type. */
function easyPaceFloor(type: SessionType, goals: Goals): number | null {
  const goal = goals[type];
  return goal ? round1(pacePer500(goal.distanceM, goal.targetSeconds) + HARD_PACE_MARGIN_S) : null;
}

/** Hard = average pace at or faster than goal pace + 5 s/500 m for its type; no goal for the type = not hard. */
export function isHardSession(session: RowingSession, goals: Goals): boolean {
  const floor = easyPaceFloor(session.type, goals);
  return floor !== null && sessionMetrics(session).pacePer500s <= floor;
}

function volumeCap(sessions: RowingSession[]): VolumeCap | null {
  if (sessions.length === 0) return null;
  const avgDistance = sessions.reduce((sum, s) => sum + s.distanceM, 0) / sessions.length;
  const avgMinutes = sessions.reduce((sum, s) => sum + s.durationS / 60, 0) / sessions.length;
  return { distanceM: round1(avgDistance * VOLUME_FACTOR), minutes: round1(avgMinutes * VOLUME_FACTOR) };
}

/**
 * Limit context for the suggestion that follows `session`. `history` may hold any sessions; only `session`
 * and those strictly before it count, so the result never changes when later sessions are logged.
 */
export function limitContext(session: RowingSession, history: readonly RowingSession[], goals: Goals): LimitContext {
  const upToSession = [session, ...previousSessions(session, history)];

  const volumeCaps: LimitContext["volumeCaps"] = {};
  for (const type of ["erg", "water"] as const) {
    const cap = volumeCap(upToSession.filter((s) => s.type === type).slice(0, BASELINE_SIZE));
    if (cap) volumeCaps[type] = cap;
  }

  const clearDrop = session.type === "water" && analyseSession(session, history).labels.includes("dpsClearDrop");

  const lastTwo = upToSession.slice(0, 2);
  const mustBeEasy = lastTwo.length === 2 && lastTwo.every((s) => isHardSession(s, goals));

  const easyPaceFloorS: LimitContext["easyPaceFloorS"] = {};
  if (mustBeEasy) {
    for (const type of ["erg", "water"] as const) {
      const floor = easyPaceFloor(type, goals);
      if (floor !== null) easyPaceFloorS[type] = floor;
    }
  }

  return { volumeCaps, maxSpmCap: clearDrop ? DROP_RATE_CAP : null, mustBeEasy, easyPaceFloorS };
}

/** Every limit the suggestion breaks; empty when it may be shown. Numbers are compared rounded to 0.1. */
export function validateSuggestion(suggestion: CheckedSuggestion, context: LimitContext): Violation[] {
  const violations: Violation[] = [];
  const type = suggestion.sessionType;
  const { maxSpm, fastestPacePer500s } = suggestion.targets;

  const cap = context.volumeCaps[type];
  if (!cap) {
    violations.push({
      code: "no_baseline_for_type",
      message: `The rower has no logged ${type} sessions yet, so there is no volume baseline for a ${type} session. Suggest a session of a type they have logged.`,
    });
  } else {
    if (suggestion.totalDistanceM !== null && round1(suggestion.totalDistanceM) > cap.distanceM) {
      violations.push({
        code: "volume_distance",
        message: `Total distance ${String(suggestion.totalDistanceM)} m is above the limit of ${String(cap.distanceM)} m (110 % of the recent ${type} average).`,
      });
    }
    if (round1(suggestion.totalMinutes) > cap.minutes) {
      violations.push({
        code: "volume_time",
        message: `Total time ${String(suggestion.totalMinutes)} min is above the limit of ${String(cap.minutes)} min (110 % of the recent ${type} average, work plus rest).`,
      });
    }
  }

  if (context.maxSpmCap !== null && maxSpm > context.maxSpmCap) {
    violations.push({
      code: "rate_cap",
      message: `Max stroke rate ${String(maxSpm)} spm is above ${String(context.maxSpmCap)} spm; the last water session showed a clear drop in distance per stroke.`,
    });
  }

  if (context.mustBeEasy) {
    if (maxSpm > EASY_MAX_SPM) {
      violations.push({
        code: "not_easy_rate",
        message: `The last two sessions were hard, so the next one must be easy: max stroke rate ${String(maxSpm)} spm is above ${String(EASY_MAX_SPM)} spm.`,
      });
    }
    const floor = context.easyPaceFloorS[type];
    if (floor !== undefined && fastestPacePer500s !== null && round1(fastestPacePer500s) <= floor) {
      violations.push({
        code: "not_easy_pace",
        message: `The last two sessions were hard, so the next one must be easy: the fastest pace target ${formatTime(fastestPacePer500s)}/500 m must be slower than ${formatTime(floor)}/500 m (goal pace + ${String(HARD_PACE_MARGIN_S)} s), or have no pace target.`,
      });
    }
  }

  return violations;
}

/**
 * The safe default for `sessionType`, clamped to the context: steady technique row, at most 35 min and within the
 * time cap, max 22 spm, no pace or distance target. It passes `validateSuggestion` for any type that has a volume
 * cap — always true for the logged session's own type.
 */
export function safeDefaultFor(sessionType: SessionType, context: LimitContext): SuggestedSession {
  const cap = context.volumeCaps[sessionType];
  // Whole minutes below the cap; a cap under one minute (very short sessions) is rounded down to 0.1 instead.
  const capMinutes = cap ? (cap.minutes >= 1 ? Math.floor(cap.minutes) : Math.floor(cap.minutes * 10) / 10) : null;
  const totalMinutes = capMinutes === null ? SAFE_DEFAULT_MINUTES : Math.min(SAFE_DEFAULT_MINUTES, capMinutes);
  return {
    sessionType,
    structure: `Steady technique row, ${String(totalMinutes)} min continuous`,
    totalDistanceM: null,
    totalMinutes,
    targets: {
      maxSpm: EASY_MAX_SPM,
      spmRange: "18-22",
      fastestPacePer500s: null,
    },
    focus: "Long strokes",
    reason: "A safe, steady session that stays within your recent volume and keeps the intensity low.",
    techniqueTip: "Lengthen each stroke: full reach at the catch and a complete finish before the recovery.",
  };
}
