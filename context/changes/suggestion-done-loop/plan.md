# Suggestion Done Loop Implementation Plan

## Overview

Roadmap S-04 (Linear JES-15; PRD US-01, FR-009, FR-010). When logging a new session, the rower answers "Did you do the suggested session?" (Done / Skipped / no answer) for the suggestion stored on their latest session. The mark is stored with the new session, is final, and shapes the next suggestion in two ways: the coaching agent sees every suggestion with its outcome, and a code-enforced **no make-up rule** caps the next suggestion after a skip. That rule gives "the new suggestion reflects it" a deterministic, unit-tested meaning.

## Current State Analysis

S-02 delivered sessions, a single stored suggestion per session, the metrics/limits engine and a small tool-using agent. Nothing records whether a suggestion was followed, and the agent cannot see past suggestions.

- `coach_suggestions` is one row per session (`session_id unique`). It has no update policy, and the delete policy was dropped (`supabase/migrations/20261008200000_create_sessions_and_suggestions.sql:68-109`, `supabase/migrations/20261008220000_coach_suggestions_no_delete.sql`). A mark therefore cannot live on that row without loosening its immutability.
- Only some suggestions are stored. `not_allowed`, `not_configured` and deadline-aborted defaults are returned unstored (`src/pages/api/sessions/[id]/suggestion.ts:107-145`), so only stored suggestions can be marked.
- `POST /api/sessions` validates the form with `SessionInputSchema`, inserts the session and redirects to `/sessions/<id>` (`src/pages/api/sessions.ts`).
- The agent reads only the in-memory `CoachingContext` (`src/lib/services/coaching/context.ts:9-21`) through three tools (`src/lib/services/coaching/tools.ts:63-160`). The turn budget is 4 requests per attempt (`getCoachingSuggestion.ts:50`).
- Limits are pure TS: `limitContext` derives `LimitContext`, `validateSuggestion` returns `Violation[]` (also used as retry feedback), and `safeDefaultFor` clamps the default to the caps (`src/lib/services/coaching/limits.ts`).
- History order everywhere is `rowed_on desc, created_at desc`. `loadSessionsUpTo` returns history as of a session, so the analysis and limits for a session never change later (`src/lib/services/sessions/load.ts:136-162`).
- `scripts/rls-check.mjs` already covers `sessions` and `coach_suggestions` against two users; `scripts/smoke.mjs` covers the log → suggestion flow without a model key.

## Desired End State

- On `/sessions/new`, when the rower's latest session has a stored suggestion with no mark yet, the form shows that suggestion's structure and asks "Did you do it?" with **Done** / **Skipped** / **Not answering**. The mark is saved together with the new session. Otherwise no question is shown.
- The suggestion panel on a session page shows a read-only line "You marked this: done/skipped" when its suggestion has a mark.
- When the next suggestion is generated for a session logged with **skipped**:
  - its `totalMinutes` is at most the skipped suggestion's `totalMinutes`, whatever the type;
  - its `totalDistanceM` is at most the skipped suggestion's `totalDistanceM` when both have the same `sessionType` and the skipped one has a distance;
  - a violation is retried with feedback, and the safe default is clamped to the cap.
- The agent's tools show, for each session in history, the suggestion it was logged against and the outcome. For **done**, that logged session is the suggested session, so the agent can compare targets with what actually happened.

### Key Discoveries:

- Insert-only RLS with an ownership check on the referenced row is the established pattern (`coach_suggestions_insert_own`, `20261008200000_create_sessions_and_suggestions.sql:85-97`). The new table follows it for both referenced rows.
- `LimitContext` already feeds the validator, the retry feedback and `safeDefaultFor`. Adding the skip cap there makes all three honour it without touching the agent loop.
- Adding a fourth tool would cost turns from a 4-turn budget, so marks go into the existing `getTrainingHistory` / `getSessionMetrics` outputs.
- Lessons: migrations are pushed and types regenerated in the first phase, before code uses the table (`context/foundation/lessons.md`). Suggestion text sent back to the model is model-written, not user-written, so it isn't fenced. No new user free text is added.

## What We're NOT Doing

- No marking anywhere other than the new-session form (no buttons on the suggestion panel, no marking without logging).
- No changing or deleting a mark once set (insert-only; a mis-tap stays).
- No marks for older suggestions: only the latest session's suggestion is asked about. Earlier unmarked ones stay unmarked for good.
- No auto-marking and no required answer: logging without an answer leaves the suggestion unmarked.
- No hard-coded effect of **done** beyond what the agent decides.
- No marks for unstored suggestions (`not_allowed`, `not_configured`, deadline-aborted defaults).
- No regenerating already-stored suggestions when marks change history (stored suggestions stay final).
- No handling of S-03 edits that reorder sessions (e.g. changing `rowed_on` after marking). Cascade deletes are covered; reordering is S-03's concern.
- No smoke coverage of the marking flow against a stored suggestion (CI has no model key, so nothing gets stored there).

## Implementation Approach

A new insert-only table `suggestion_outcomes` links a suggestion to the session logged with its answer. The form gets the suggestion that can be marked from the page loader. `POST /api/sessions` re-checks it on the server, inserts the session first and then the outcome, so a session is never lost to a failed mark. For generation, the endpoint loads outcomes for the history window. The coaching context carries them, `limitContext` turns a **skipped** mark recorded with the session being coached into a skip cap, and the tools describe outcomes to the model.

Planner-derived rules (veto at review):

- **Only stored suggestions can be marked.** A stored `model_failed` default can be marked; unstored defaults cannot.
- **A mark is rejected on a backdated log.** If the new session is ordered before the suggested session (`rowed_on` earlier), the log is rejected with a form error, because "done" would claim an earlier session was the suggested one. With the same date it is accepted, since the new session's `created_at` is later.
- **The cap comes from one mark only:** the mark entered with the session being coached (`logged_session_id = session.id`). Older skips only inform the agent. This keeps the limits for a session fixed once computed.
- **Marks cascade:** a mark is deleted with either its suggestion's session or the session it was logged with.

## Critical Implementation Details

- **Ordering in `POST /api/sessions`:** read the latest session, its stored suggestion and any existing mark *before* inserting the new session, because the new session becomes the latest. Insert the session, then the outcome. An outcome insert failure (including a unique conflict from a parallel submit) is logged and ignored; the redirect still goes to the new session.
- **Stable limits:** the skip cap is derived from the outcome whose `logged_session_id` is the coached session. It is never derived from "the latest mark", so reloading an older session's page or generating its suggestion late gives the same limits.

## Phase 1: Store and capture the mark

### Overview

Rowers can mark the latest suggestion while logging. Marks are stored safely and shown on the suggestion panel. The next suggestion doesn't use them yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_create_suggestion_outcomes.sql`

**Intent**: Store one final done/skipped mark per suggestion, tied to the session logged with it, with each user able to see and insert only their own rows.

**Contract**: Table `public.suggestion_outcomes`:
- `id uuid pk`
- `user_id uuid not null default auth.uid()` → `auth.users` on delete cascade
- `suggestion_id uuid not null unique` → `coach_suggestions(id)` on delete cascade
- `logged_session_id uuid not null unique` → `sessions(id)` on delete cascade
- `outcome text not null check (outcome in ('done','skipped'))`
- `created_at timestamptz not null default now()`

RLS is enabled with two policies:
- **select own**: `user_id = auth.uid()`.
- **insert own**: `user_id = auth.uid()`, and both the referenced suggestion and the logged session belong to the caller (column references qualified with the table name, as in `coach_suggestions_insert_own`).

There is no update or delete policy. The file starts with a header comment in the style of the existing migrations. Push with `npx supabase db push` and regenerate `src/db/database.types.ts` before any code uses the table, and commit both together.

#### 2. Loaders

**File**: `src/lib/services/sessions/load.ts`

**Intent**: Read the suggestion that can be marked for the form, the mark of one suggestion for the panel, and the marks for a set of sessions (used in phase 2).

**Contract**:
- `loadMarkableSuggestion(supabase)` returns `{ markable: { suggestionId, sessionId, rowedOn, createdAt, sessionType, structure } | null, loadFailed }`. It loads the latest session (existing order) and its stored suggestion. The result is null when there's no stored suggestion, when the suggestion's JSON doesn't parse, or when an outcome already exists for it.
- `loadSuggestionOutcome(supabase, suggestionId)` returns `{ outcome: "done" | "skipped" | null, loadFailed }`.
- `StoredSuggestion` gains `id`, so the page can look up its mark. The existing select adds `id`.
- Types `SuggestionOutcome = "done" | "skipped"` live next to the existing session types (`src/types.ts` or `schema.ts`, matching where `SessionType` lives).

#### 3. Form input rules

**File**: `src/lib/services/sessions/rules.ts`

**Intent**: Accept an optional mark with the session form.

**Contract**: `SessionInputSchema` gains `markedSuggestionId` (uuid, optional; empty string means absent) and `outcome` (`"done" | "skipped"`, optional; empty or `"none"` means absent). The pair is valid only when both are present or both are absent. Unit tests in `rules.test.ts` cover the valid pairs, a lone id, a lone outcome and a non-uuid id.

#### 4. Log page and form

**Files**: `src/pages/sessions/new.astro`, `src/components/sessions/SessionForm.tsx`

**Intent**: Show the question only when there is a suggestion that can be marked. A failed read hides the question and never blocks logging.

**Contract**: `new.astro` calls `loadMarkableSuggestion` and passes `markable` (or null) to `SessionForm`. The form renders a fieldset "Did you do the suggested session?" above the submit button. It shows the suggestion's date/type and `structure`, a radio group **Done** / **Skipped** / **Not answering** (default: Not answering), and a hidden `markedSuggestionId`. The fieldset is accessible (legend, labelled radios), matching the existing form styling.

#### 5. Save the mark with the session

**File**: `src/pages/api/sessions.ts`

**Intent**: Store the mark only for the suggestion that is still the latest session's and still unmarked, and never lose the session.

**Contract**: When the parsed input has a mark, the handler runs these checks before the session insert:
- call `loadMarkableSuggestion`;
- if it fails or its `suggestionId` differs from the submitted one, drop the mark silently, because the question was stale (a newer session was logged in another tab);
- if the new session's `rowedOn` is before the markable session's `rowedOn`, redirect with the form error "A marked session can't be dated before the suggested session (<date>)".

After the session insert, insert `suggestion_outcomes` with `suggestion_id`, `logged_session_id` = new id, `outcome` and `user_id`. Any error is logged in the existing `console.error` style (code/message only) and the handler still redirects to the new session.

#### 6. Panel shows the mark

**Files**: `src/pages/sessions/[id].astro`, `src/components/sessions/SuggestionPanel.tsx`

**Intent**: Show what the rower answered for the suggestion on this page.

**Contract**: The page loads `loadSuggestionOutcome` for the stored suggestion's id. `SuggestionPanel` takes an optional `outcome: "done" | "skipped" | null` prop and renders one muted line under the suggestion: "You marked this: Done" / "Skipped". A failed read shows nothing.

#### 7. RLS check

**File**: `scripts/rls-check.mjs`

**Intent**: Prove the new table's privacy and immutability against the real database.

**Contract**: The existing pattern gets these new checks:
- user A inserts an outcome for their own suggestion and their own later session, and can read it back;
- A can't insert a second outcome for the same suggestion;
- A's update and delete change nothing;
- user B can't read A's outcome;
- B can't insert an outcome referencing A's suggestion or A's session;
- anon reads nothing.

Data is created through the same REST calls the script already uses for `coach_suggestions`.

### Success Criteria:

#### Automated Verification:

- Migration is pushed and types are regenerated: `npx supabase db push` succeeds and `src/db/database.types.ts` contains `suggestion_outcomes`
- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type and build check passes: `npm run build`
- RLS check passes including the new outcome checks: `npm run rls-check`
- Smoke passes unchanged: `npm run smoke`

#### Manual Verification:

- After a session with a stored suggestion, `/sessions/new` shows the question with that suggestion's structure; choosing Done and saving shows "You marked this: Done" on the previous session's panel
- Logging again right after (the latest session now has no mark-able stored suggestion, or it was already marked) shows no question
- Choosing "Not answering" leaves the suggestion unmarked and the next log asks about the new latest suggestion instead
- Dating the new session before the suggested session with a mark selected shows the form error; without a mark it saves normally
- An account that isn't allowlisted (unstored default) never sees the question

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Make the next suggestion reflect it

### Overview

Marks enter the coaching context: a skip caps the next suggestion in code, and the agent sees every suggestion's outcome.

### Changes Required:

#### 1. Outcomes loader

**File**: `src/lib/services/sessions/load.ts`

**Intent**: Load the suggestions and marks relevant to a history window in one or two reads.

**Contract**: `loadSuggestionOutcomes(supabase, sessionIds)` returns `{ answered: AnsweredSuggestion[], loadFailed }`. Each `AnsweredSuggestion` is `{ loggedSessionId, suggestedForSessionId, outcome, suggestion: SuggestedSession }`, covering outcomes whose `logged_session_id` is in `sessionIds`, joined with the suggestion's JSON. Rows whose suggestion JSON doesn't parse are skipped with a log line.

#### 2. Coaching context

**File**: `src/lib/services/coaching/context.ts`

**Intent**: Carry the marks so tools and limits can use them.

**Contract**: `CoachingContext` gains `answered: AnsweredSuggestion[]`, and `buildCoachingContext` gains a parameter for it. `limitContext` receives the one entry whose `loggedSessionId === session.id` (or null).

#### 3. No make-up rule

**File**: `src/lib/services/coaching/limits.ts` (+ `limits.test.ts`)

**Intent**: After a skip, the next suggestion never asks for more than the skipped one, so missed work isn't caught up.

**Contract**:
- `LimitContext` gains `skipCap: { sessionType, minutes, distanceM: number | null } | null`. It is set only when the coached session was logged with **skipped**, copying the skipped suggestion's `sessionType`, `totalMinutes` and `totalDistanceM`.
- `validateSuggestion` adds two violation codes:
  - `skip_time` when `totalMinutes > skipCap.minutes` (any type);
  - `skip_distance` when the suggestion's type equals `skipCap.sessionType`, `skipCap.distanceM` isn't null and `totalDistanceM` exceeds it.
- Both carry readable messages for retry feedback.
- `safeDefaultFor` clamps minutes (and distance for the same type) to the skip cap as well as the volume cap.
- **done** sets no cap.

Unit tests cover:
- skip with a same-type over-distance suggestion → `skip_distance`;
- skip with an other-type suggestion → only the minutes cap applies;
- skip whose suggestion has a null distance → minutes only;
- exactly at the cap → passes;
- **done** → no cap;
- unmarked → no cap;
- the default is clamped by the skip cap.

#### 4. Tools and prompt

**Files**: `src/lib/services/coaching/tools.ts` (+ `tools.test.ts`), `src/lib/services/coaching/getCoachingSuggestion.ts`

**Intent**: Let the agent take done/skipped history into account (FR-010) and know about the skip cap.

**Contract**:
- `describeSession` adds `answeredSuggestion` when the session was logged with a mark: `{ outcome, suggested: { sessionType, structure, totalMinutes, totalDistanceM, maxSpm, fastestPacePer500 } }`, or null.
- `getTrainingHistory`'s description explains that **done** means this session was the suggested one, and **skipped** means it was not done.
- `getSessionMetrics` includes `limits.skipCap` with a note when it is set.
- The system prompt gains:
  - one rule line: "when skipCap is set: totalMinutes at most skipCap.minutes, and totalDistanceM at most skipCap.distanceM for the same type";
  - one coaching line: use done/skipped history and, for done sessions, compare what was rowed with the suggested targets.

Tool tests cover the outcome fields and the skip-cap block.

#### 5. Endpoint wiring

**File**: `src/pages/api/sessions/[id]/suggestion.ts`

**Intent**: Load marks with the history so the stored suggestion reflects them.

**Contract**: After history loads, the endpoint calls `loadSuggestionOutcomes` for the history's session ids, then passes the result to `buildCoachingContext`. A failed outcome read fails the request with a 500, like a failed history read, because a missing skip would loosen the limits. The unstored defaults (`not_allowed`, `not_configured`) also use the context's limits, so they are clamped too.

#### 6. Session page analysis consistency

**File**: `src/pages/sessions/[id].astro`

**Intent**: Keep the page compiling against the new `buildCoachingContext`/`limitContext` signatures. If the page shows limits derived from `limitContext`, pass the outcome there too. Otherwise no change.

**Contract**: No new UI in this phase.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new skip-cap and tool-output tests: `npm test`
- Lint passes: `npm run lint`
- Type and build check passes: `npm run build`
- RLS check still passes: `npm run rls-check`
- Smoke passes (endpoint still returns the safe default without a key): `npm run smoke`

#### Manual Verification:

- On an allowlisted account: mark the latest suggestion **Skipped** while logging; the new session's suggestion has total minutes ≤ the skipped suggestion's (and distance ≤ it when the same type)
- Mark **Done** while logging the suggested session; the new suggestion's reason refers to how that session went compared with the suggestion
- `wrangler tail` shows no new errors; any `skip_time`/`skip_distance` violation in attempt 1 is followed by a compliant attempt 2 or a clamped default

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `rules.test.ts`: mark pair validation.
- `limits.test.ts`: skip cap boundaries, cross-type minutes-only cap, null distance, done/unmarked no-op, default clamping.
- `tools.test.ts`: `answeredSuggestion` in history and metrics tools; `skipCap` present only when set.

### Integration Tests:

- `rls-check.mjs`: owner insert/read; duplicate rejected; update/delete no-ops; cross-user read/insert rejected; anon read empty.
- `smoke.mjs`: unchanged flows still pass (form with no question for a fresh CI user).

### Manual Testing Steps:

1. Log session A on an allowlisted account and wait for its suggestion.
2. Open `/sessions/new`: the question shows A's suggestion. Choose Skipped and log B.
3. A's page shows "You marked this: Skipped". B's suggestion respects the skip cap.
4. Open `/sessions/new` again: the question now shows B's suggestion. Choose Not answering and log C; B stays unmarked.
5. Log D dated before C with Done selected: you get the form error.

## Performance Considerations

The log page adds one or two small reads. The suggestion endpoint adds one read for outcomes within the 30-session window. There are no extra model calls; the tool output grows slightly.

## Migration Notes

The new table only; existing rows are untouched. All existing suggestions start unmarked. Push the migration and regenerate types in phase 1 before merging code that uses them (lessons.md).

## References

- Roadmap: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (US-01, FR-009, FR-010)
- Prior change: `context/archive/2026-10-08-first-session-suggestion/plan.md`
- Insert-only RLS pattern: `supabase/migrations/20261008200000_create_sessions_and_suggestions.sql:85-109`
- Limits engine: `src/lib/services/coaching/limits.ts:28-60`
- Agent tools: `src/lib/services/coaching/tools.ts:63-160`
- Suggestion endpoint: `src/pages/api/sessions/[id]/suggestion.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Store and capture the mark

#### Automated

- [x] 1.1 Migration is pushed and types are regenerated: `npx supabase db push` succeeds and `src/db/database.types.ts` contains `suggestion_outcomes` — a19a4b8
- [x] 1.2 Unit tests pass: `npm test` — a19a4b8
- [x] 1.3 Lint passes: `npm run lint` — a19a4b8
- [x] 1.4 Type and build check passes: `npm run build` — a19a4b8
- [x] 1.5 RLS check passes including the new outcome checks: `npm run rls-check` — d60e645
- [x] 1.6 Smoke passes unchanged: `npm run smoke` — d60e645

#### Manual

- [x] 1.7 After a session with a stored suggestion, `/sessions/new` shows the question with that suggestion's structure; choosing Done and saving shows "You marked this: Done" on the previous session's panel — cb448c4
- [x] 1.8 Logging again right after (the latest session now has no mark-able stored suggestion, or it was already marked) shows no question — cb448c4
- [x] 1.9 Choosing "Not answering" leaves the suggestion unmarked and the next log asks about the new latest suggestion instead — cb448c4
- [x] 1.10 Dating the new session before the suggested session with a mark selected shows the form error; without a mark it saves normally — cb448c4
- [x] 1.11 An account that isn't allowlisted (unstored default) never sees the question — cb448c4

### Phase 2: Make the next suggestion reflect it

#### Automated

- [x] 2.1 Unit tests pass, including the new skip-cap and tool-output tests: `npm test` — 4eaec1e
- [x] 2.2 Lint passes: `npm run lint` — 4eaec1e
- [x] 2.3 Type and build check passes: `npm run build` — 4eaec1e
- [x] 2.4 RLS check still passes: `npm run rls-check` — d60e645
- [x] 2.5 Smoke passes (endpoint still returns the safe default without a key): `npm run smoke` — d60e645

#### Manual

- [x] 2.6 On an allowlisted account: mark the latest suggestion **Skipped** while logging; the new session's suggestion has total minutes ≤ the skipped suggestion's (and distance ≤ it when the same type) — cb448c4
- [x] 2.7 Mark **Done** while logging the suggested session; the new suggestion's reason refers to how that session went compared with the suggestion — cb448c4
- [x] 2.8 `wrangler tail` shows no new errors; any `skip_time`/`skip_distance` violation in attempt 1 is followed by a compliant attempt 2 or a clamped default — cb448c4
