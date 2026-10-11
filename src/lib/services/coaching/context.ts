import type { RowerProfile, RowingSession } from "@/types";

import { limitContext } from "./limits";
import type { Goals, LimitContext } from "./limits";
import { analyseSession } from "./metrics";
import type { SessionAnalysis } from "./metrics";
import type { SuggestedSession, SuggestionOutcome } from "./schema";

/** A stored suggestion the rower marked while logging `loggedSessionId`. */
export interface AnsweredSuggestion {
  /** The session logged together with the mark; for "done" it is the suggested session itself. */
  loggedSessionId: string;
  /** The session the suggestion was made after. */
  suggestedForSessionId: string;
  outcome: SuggestionOutcome;
  suggestion: SuggestedSession;
}

/** Everything the coaching agent may read, loaded and computed before the first model call. */
export interface CoachingContext {
  /** The session just logged; the suggestion is for the session after it. */
  session: RowingSession;
  /** Sessions up to and including `session`, newest first (as `loadSessionsUpTo` returns them). */
  history: RowingSession[];
  profile: RowerProfile | null;
  goals: Goals;
  /** `session` against its baseline, computed in TypeScript (never by the model). */
  analysis: SessionAnalysis;
  /** The limits the suggestion must respect. */
  limits: LimitContext;
  /** Marked suggestions whose logged session is in `history` (any order). */
  answered: AnsweredSuggestion[];
}

/**
 * Pure: derives the analysis and limits from what the loaders returned. Only the mark entered with `session` itself
 * can cap the next suggestion (a skip), so its limits never change when later sessions are marked.
 */
export function buildCoachingContext(
  session: RowingSession,
  history: RowingSession[],
  profile: RowerProfile | null,
  goals: Goals,
  answered: AnsweredSuggestion[] = [],
): CoachingContext {
  const markedWithSession = answered.find((entry) => entry.loggedSessionId === session.id);
  const skipped = markedWithSession?.outcome === "skipped" ? markedWithSession.suggestion : null;
  return {
    session,
    history,
    profile,
    goals,
    analysis: analyseSession(session, history),
    limits: limitContext(session, history, goals, skipped),
    answered,
  };
}
