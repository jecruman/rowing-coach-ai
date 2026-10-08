import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { ageFromBirthYear } from "@/lib/services/profile/load";
import { formatTime, pacePer500 } from "@/lib/services/profile/rules";
import { MAX_COMMENT_LENGTH } from "@/lib/services/sessions/rules";
import type { NumberRange, RowingSession } from "@/types";

import type { CoachingContext } from "./context";
import { previousSessions, sessionMetrics } from "./metrics";

/** Most sessions `getTrainingHistory` ever returns. */
export const MAX_HISTORY_SESSIONS = 10;
const DEFAULT_HISTORY_SESSIONS = 5;

/** A tag that could open or close the fence; stripped from comments so they cannot break out of it. */
const FENCE_TAG = /<\s*\/?\s*rower_comment[^>]*>/gi;

/**
 * Wraps a rower-written comment in `<rower_comment>` tags (lessons.md: user text sent to the model is limited and
 * fenced). Comments are capped at `MAX_COMMENT_LENGTH` when saved; the cap is applied again here so nothing longer
 * ever reaches the model.
 */
export function fenceComment(comment: string | null): string | null {
  if (comment === null) return null;
  const text = comment.slice(0, MAX_COMMENT_LENGTH).replace(FENCE_TAG, "");
  return `<rower_comment>${text}</rower_comment>`;
}

function rangeText(range: NumberRange | null): string | null {
  if (range === null) return null;
  return range.min === range.max ? String(range.min) : `${String(range.min)}-${String(range.max)}`;
}

/** One session as the model sees it: no ids, comment fenced. */
function describeSession(session: RowingSession) {
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
    description: `The rower's sessions up to and including the one just logged, newest first, at most ${String(MAX_HISTORY_SESSIONS)}. Each comment is the rower's own words inside <rower_comment> tags.`,
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
      return json({ sessions: sessions.map(describeSession) });
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
        session: describeSession(context.session),
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
        },
      });
    },
  });

  return [getAthleteProfile, getTrainingHistory, getSessionMetrics];
}
