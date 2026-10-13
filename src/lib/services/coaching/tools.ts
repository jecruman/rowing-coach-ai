import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { ageFromBirthYear } from "@/lib/services/profile/load";
import { formatTime, pacePer500 } from "@/lib/services/profile/rules";
import { MAX_COMMENT_LENGTH } from "@/lib/services/sessions/rules";
import type { NumberRange, RowingSession } from "@/types";

import type { AnsweredSuggestion, CoachingContext } from "./context";
import { previousSessions, sessionMetrics } from "./metrics";

/** Most sessions `getTrainingHistory` ever returns. */
export const MAX_HISTORY_SESSIONS = 10;
const DEFAULT_HISTORY_SESSIONS = 5;

/**
 * Wraps a rower-written comment in `<rower_comment>` tags (lessons.md: user text sent to the model is limited and
 * fenced). Comments are capped at `MAX_COMMENT_LENGTH` when saved; the cap is applied again here so nothing longer
 * ever reaches the model. Angle brackets become ‹ › so no tag — even one rebuilt from nested pieces — can close the fence.
 */
export function fenceComment(comment: string | null): string | null {
  if (comment === null) return null;
  const text = comment.slice(0, MAX_COMMENT_LENGTH).replaceAll("<", "‹").replaceAll(">", "›");
  return `<rower_comment>${text}</rower_comment>`;
}

function rangeText(range: NumberRange | null): string | null {
  if (range === null) return null;
  return range.min === range.max ? String(range.min) : `${String(range.min)}-${String(range.max)}`;
}

/** Longest suggested structure (SuggestedSessionSchema `structure`); applied again before the text reaches the model. */
const MAX_STRUCTURE_LENGTH = 300;

/**
 * Wraps a stored suggestion's structure in `<suggested_structure>` tags. Stored suggestions are normally
 * model-written, but a rower can insert their own `coach_suggestions` row, so the text is treated as user text
 * (lessons.md): capped and fenced, with angle brackets made harmless as in `fenceComment`.
 */
export function fenceStructure(structure: string): string {
  const text = structure.slice(0, MAX_STRUCTURE_LENGTH).replaceAll("<", "‹").replaceAll(">", "›");
  return `<suggested_structure>${text}</suggested_structure>`;
}

/**
 * The suggestion the rower marked when logging a session, as the model sees it: for "done" the session is the
 * suggested one, so the targets can be compared with what was rowed. Suggestion text is model-written, not fenced.
 */
function describeAnswered(answered: AnsweredSuggestion | undefined) {
  if (!answered) return null;
  const { suggestion } = answered;
  return {
    outcome: answered.outcome,
    suggested: {
      sessionType: suggestion.sessionType,
      structure: fenceStructure(suggestion.structure),
      totalMinutes: suggestion.totalMinutes,
      totalDistanceM: suggestion.totalDistanceM,
      maxSpm: suggestion.targets.maxSpm,
      fastestPacePer500m:
        suggestion.targets.fastestPacePer500s === null ? null : formatTime(suggestion.targets.fastestPacePer500s),
    },
  };
}

/** One session as the model sees it: no ids, comment fenced, plus the suggestion marked with it (if any). */
function describeSession(session: RowingSession, answered: readonly AnsweredSuggestion[]) {
  const metrics = sessionMetrics(session);
  return {
    rowedOn: session.rowedOn,
    type: session.type,
    distanceM: session.distanceM,
    duration: formatTime(session.durationS),
    durationMinutes: Math.round((session.durationS / 60) * 10) / 10,
    pacePer500m: formatTime(metrics.pacePer500s),
    pacePer500s: metrics.pacePer500s,
    splitDriftS: metrics.splitDriftS,
    spm: rangeText(session.spm),
    dpsM: rangeText(session.dps),
    watts: session.watts,
    boat: session.boat,
    comment: fenceComment(session.comment),
    answeredSuggestion: describeAnswered(answered.find((entry) => entry.loggedSessionId === session.id)),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * The agent's three read-only tools. Each `run` only reads `context` (no I/O), so the model can call them in any
 * order and as often as it likes within the turn budget.
 */
export function buildCoachingTools(context: CoachingContext) {
  const getAthleteProfile = betaZodTool({
    name: "getAthleteProfile",
    description:
      "The rower's profile (age, weight, boat) and their goals per session type (distance, target time, goal pace per 500 m, event date). Fields may be null when not set.",
    inputSchema: z.object({}),
    run: () => {
      const profile = context.profile;
      const goals = Object.values(context.goals).map((goal) => ({
        sessionType: goal.sessionType,
        distanceM: goal.distanceM,
        targetTime: formatTime(goal.targetSeconds),
        goalPacePer500m: formatTime(pacePer500(goal.distanceM, goal.targetSeconds)),
        eventDate: goal.eventDate,
      }));
      return json({
        profile: profile
          ? { age: ageFromBirthYear(profile.birthYear), weightKg: profile.weightKg, boat: profile.boat }
          : null,
        goals,
      });
    },
  });

  const getTrainingHistory = betaZodTool({
    name: "getTrainingHistory",
    description: `The rower's sessions up to and including the one just logged, newest first, at most ${String(MAX_HISTORY_SESSIONS)}. Each comment is the rower's own words inside <rower_comment> tags. answeredSuggestion is the previous suggestion the rower marked when logging that session: "done" means this session is the suggested one (compare it with the suggested targets), "skipped" means the suggestion was not done; null means no answer. Each suggested structure is inside <suggested_structure> tags.`,
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_HISTORY_SESSIONS)
        .optional()
        .describe(
          `How many sessions to return (1-${String(MAX_HISTORY_SESSIONS)}, default ${String(DEFAULT_HISTORY_SESSIONS)}).`,
        ),
    }),
    run: ({ limit }) => {
      const count = Math.min(limit ?? DEFAULT_HISTORY_SESSIONS, MAX_HISTORY_SESSIONS);
      const sessions = [context.session, ...previousSessions(context.session, context.history)].slice(0, count);
      return json({ sessions: sessions.map((session) => describeSession(session, context.answered)) });
    },
  });

  const getSessionMetrics = betaZodTool({
    name: "getSessionMetrics",
    description:
      "The session just logged, its metrics against the baseline (average of up to 3 previous sessions of the same type), and the safety limits the next session must respect. Always read this before answering.",
    inputSchema: z.object({}),
    run: () => {
      const { analysis, limits } = context;
      return json({
        session: describeSession(context.session, context.answered),
        analysis: {
          baselineSessions: analysis.baselineCount,
          metrics: analysis.metrics,
          baseline: analysis.baseline,
          deltas: analysis.deltas,
          labels: analysis.labels,
        },
        limits: {
          volumeCaps: limits.volumeCaps,
          volumeCapsNote:
            "Per session type: the next session's totalDistanceM and totalMinutes (work plus rest, warm-up and cool-down included) must not exceed these. A type without a cap has no logged sessions and must not be suggested.",
          maxSpmCap: limits.maxSpmCap,
          mustBeEasy: limits.mustBeEasy,
          ...(limits.mustBeEasy
            ? {
                easyRule:
                  "The last two sessions were hard: targets.maxSpm must be at most 22 and every pace target slower than easyPaceFloorS for its type (or no pace target).",
                easyPaceFloorS: limits.easyPaceFloorS,
              }
            : {}),
          ...(limits.skipCap
            ? {
                skipCap: limits.skipCap,
                skipCapNote:
                  "The rower skipped the previous suggestion, so missed work is not made up: totalMinutes must be at most skipCap.minutes (any type), and totalDistanceM at most skipCap.distanceM when suggesting the same type (no distance limit when it is null).",
              }
            : {}),
        },
      });
    },
  });

  return [getAthleteProfile, getTrainingHistory, getSessionMetrics];
}
