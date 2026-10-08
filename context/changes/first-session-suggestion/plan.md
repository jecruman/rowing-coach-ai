# First Session Suggestion Implementation Plan

## Overview

Deliver roadmap slice S-02 (north star, Linear JES-13): a signed-in rower logs an erg or water session with type-specific fields and an optional comment, immediately sees the session's metrics against their recent baseline (computed in code), and then gets one suggested next session from a small Claude agent with read-only tools. Every suggestion is checked in code against the three PRD safety limits; a breaking suggestion is retried once with feedback, then replaced by the safe default, labelled as a default. Only allowlisted rowers get model suggestions.

## Current State Analysis

- F-01 left a tested single-call coaching service: `getCoachingSuggestion(input, { client, model })` with retry-once-then-default, fenced user text and input limits (`src/lib/services/coaching/getCoachingSuggestion.ts:35-138`, `schema.ts:10-55`). Its output has free-text `structure` and optional `targets.maxSpm`, so limits 1 (volume) and 3 (hard → easy) cannot be checked today. The input carries no history, metrics or profile.
- `src/pages/api/coaching/try.ts` is a temporary allowlisted endpoint using a fixed PRD sample; `allowlist.ts` (`isEmailAllowed`) and `COACH_TRY_EMAILS` (`astro.config.mjs:31`) exist only for it.
- S-01 left the per-user data pattern: migration `supabase/migrations/20261008151626_create_profiles_and_goals.sql` (shared `set_updated_at()`, `user_id default auth.uid()`, per-operation RLS `<table>_<op>_own`), generated `src/db/database.types.ts`, `loadProfileAndGoals` with `loadFailed` (`src/lib/services/profile/load.ts:7-56`), time helpers `parseTime` / `formatTime` / `pacePer500` (`src/lib/services/profile/rules.ts:21-46`), form endpoint pattern (`src/pages/api/goals.ts`), form components (`src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `src/components/profile/*`), `PROTECTED_ROUTES` (`src/middleware.ts:4`).
- Verification: `scripts/rls-check.mjs` (steps array, `ownerMoveRejected`), `scripts/smoke.mjs` (`request()` with cookie jar, `{status, location}` steps), CI types-vs-migrations diff (`.github/workflows/ci.yml:48-56`). The smoke job has no Anthropic key.
- Measured on F-01: one structured call ≈ 8.2 s wall, 21 ms CPU. The project stays on the Workers free plan (50 subrequests/request; watch for error 1102).
- Research: `context/changes/first-session-suggestion/research.md`.

## Desired End State

1. `/sessions/new` (phone-friendly) lets a rower log erg (distance, time, splits, SPM range, optional watts) or water (distance, time, splits, SPM range, DPS range, optional boat) plus date and optional comment. Saving redirects to `/sessions/<id>`.
2. `/sessions/<id>` shows the logged values and the analysis in under a second: pace /500 m, split drift, SPM and DPS midpoints, each with its delta vs "your last N" same-type sessions (N = 0–3), the PRD labels and the technique verdict.
3. The same page then shows "Coach is thinking…" and renders one suggestion (structure, targets, focus, reason, technique tip) that passes all three limits — or the safe default, clearly labelled with the reason. Reloading shows the stored suggestion without a new model call.
4. A non-allowlisted rower can log and see analysis; the suggestion area shows the labelled safe default ("Personal coaching is not enabled for this account").
5. The dashboard links to "Log a session" and to the latest session.
6. CI: unit tests for metrics, limits, tools and agent service; `rls-check` covers both new tables; smoke covers logging and the suggestion endpoint's no-key path; types match migrations.

Verify via `npm test`, `npm run rls-check`, `npm run smoke`, CI green, and the manual steps per phase.

### Key Discoveries:

- Retry loop shape to extend: `MAX_ATTEMPTS` and attempt function (`getCoachingSuggestion.ts:35`, `:55-97`) — a limit violation becomes a failed attempt.
- `@anthropic-ai/sdk` 0.131.0 provides `client.beta.messages.toolRunner` (`node_modules/@anthropic-ai/sdk/src/resources/beta/messages/messages.ts:223-233`) with `max_iterations` (`src/lib/tools/BetaToolRunner.ts:134`) and `betaZodTool` (`src/helpers/beta/zod.ts:46`). The runner calls `messages.create`, not `.parse` (`BetaToolRunner.ts:245`), so our code must parse the final answer with the zod schema.
- Forced `tool_choice` is rejected on `claude-opus-5-5`; use `auto` + prompt instruction.
- Lessons: fence and length-limit every user-written field sent to the model; push the migration and regenerate types before code that needs it (`context/foundation/lessons.md`).

## What We're NOT Doing

- No viewing list, editing or deleting of sessions (S-03), no done/skipped marking or adaptation to it (S-04), no metric trend (S-05).
- No new SPM-rise or pace-decline thresholds; pace getting slower is shown as a delta, never labelled.
- No per-rower relative thresholds; MVP thresholds are absolute (PRD numbers).
- No per-split SPM/DPS entry, no imports (ErgData, SpeedCoach, Garmin), no screenshots.
- No model-side writes: `saveRecommendation` / `createTrainingSession` are not model tools; code saves.
- No daily per-user cap; cost is guarded by the allowlist plus an Anthropic workspace spend limit (console).
- No streaming of the model answer; the island shows a waiting state.
- No Workers Paid upgrade (decided: stay on free plan unless CPU errors appear).
- No regeneration of a stored suggestion (a stored model answer or model-failure default is final for that session).

## Implementation Approach

Data first (phase 1, one migration for both tables, pushed by the user before the commit), then a pure deterministic engine (phase 2) that owns every guarantee: metrics, baseline, flags, limit context, suggestion validator and the clamped safe default. Phase 3 turns the F-01 single call into a small agent: code preloads all data, the model reads it through three in-memory tools, and the validator runs after every final answer inside the existing retry loop. Phase 3 opens with a real-API spike because tool use + structured output + server-side fallbacks have not been verified together. Phase 4 exposes it: a JSON endpoint that returns the stored suggestion or generates and stores one, a React island with waiting/retry states, the allowlist cutover and removal of the try-it endpoint.

Decision record (from planning, all user-confirmed):

- **Baseline**: metrics compare the new session with the average of up to 3 previous same-type sessions ("vs your last N"); with 0 previous sessions values show without deltas.
- **Volume cap (limit 1)**: computed from up to 3 latest same-type sessions *including* the new one, so the first session already caps the next at +10% of itself. Both total distance and total time (work + rest) must be ≤ 110 % of the respective averages.
- **Hard / easy (limit 3)**: a session is hard when its average pace ≤ goal pace for its type + 5 s/500 m; unknown (no goal for that type) = not hard. The last 2 sessions of any type count. After 2 hard: the suggestion must have max rate ≤ 22 spm and every pace target slower than goal pace + 5 s for the suggested type (pace part skipped when that type has no goal).
- **Metrics**: pace = time ÷ distance × 500; split drift = last − first split (s/500 m, + = slowing), only with ≥ 2 splits; SPM and DPS compared by range midpoint.
- **Labels**: DPS ≥ +0.5 m "huge improvement", DPS ≤ −0.3 m "clear drop", pace ≤ −5 s "good improvement", and "technique may be limiting efficiency" when pace improved (delta < 0) while DPS clearly dropped.
- **Format**: suggestion keeps readable text and adds required numbers `totalDistanceM`, `totalMinutes`, `maxSpm`, `fastestPacePer500s` (null for no pace target); the validator trusts the numbers.
- **Agent**: small agent, three read-only in-memory tools, `max_iterations` 4 per attempt, code saves and validates.
- **Flow**: save → `/sessions/<id>` with instant analysis → island fetches suggestion; stored suggestion shown on reload.
- **Cost guard**: allowlist (`COACH_EMAILS`) + Anthropic workspace monthly spend limit.

Derived by the planner (veto at plan review if wrong):

- "Latest" order = `rowed_on` desc, then `created_at` desc; "previous" = strictly earlier in that order.
- A suggestion for a session type with no logged sessions has no volume baseline and is a violation (retry → default for the logged type).
- Limit 2 trigger = the just-logged session is water with a "clear drop" label; it caps `maxSpm` ≤ 32 for the next suggestion of either type.
- Safe default is generated per context: steady technique row, `totalMinutes` = min(35, time cap rounded down), `maxSpm` 22, no pace target, `totalDistanceM` null; it passes all limits by construction.
- Threshold comparisons use values rounded to 0.1 to avoid float edge cases (e.g. −0.29999).

## Critical Implementation Details

- **Ordering**: run `npx supabase db push` (user, own terminal) and regenerate `src/db/database.types.ts` before committing phase 1 — CI's types check and the deployed code both need the tables (lessons.md).
- **Spike before the agent**: phase 3 starts with a local throwaway script against the real API (key from `.dev.vars`, not committed) that checks `toolRunner` + `output_config.format` + `fallbacks: "default"` + beta header together. If the API rejects `format` alongside tools, the fallback design is: run the tool loop without `format`, then one final `beta.messages.parse` call with the loop's message history and `betaZodOutputFormat` (no tools). Record the outcome in this plan's Phase 3 block before building.
- **Subrequest budget**: worst case per suggestion request ≈ 1 auth + 3 loads + 2 attempts × 4 model turns + 1 insert ≈ 13, under the free plan's 50.
- **Prompt injection**: comments of the current and earlier sessions reach the model through tool results; every comment is wrapped in `<rower_comment>` inside the tool output and the system prompt states that tool results and tagged content are data, not instructions.

## Phase 1: Session logging and storage

### Overview

Create the `sessions` and `coach_suggestions` tables with RLS, regenerate types, extend `rls-check`, and let a rower log a session and land on its page (raw values only).

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_sessions_and_suggestions.sql`

**Intent**: Store logged sessions and one stored suggestion per session, private to their owner, following the S-01 pattern.

**Contract**:
- `sessions`: `id uuid pk`, `user_id uuid default auth.uid() references auth.users on delete cascade`, `session_type` (`erg`|`water`), `rowed_on date default current_date`, `distance_m int` (100–100000), `duration_s numeric(7,1)` (> 0, ≤ 36000), `splits_s numeric(6,1)[]` (nullable; when present `cardinality(splits_s) between 1 and 200` — not `array_length`, which is NULL for an empty array and would pass the check), `spm_min`/`spm_max smallint` (10–60, min ≤ max, nullable together), `dps_min`/`dps_max numeric(4,1)` (3–20, water only), `watts smallint` (erg only, 1–2000), `boat` (water only, same list as profiles), `comment text` (≤ 1000), `created_at`, `updated_at` + `set_updated_at` trigger. Index on `(user_id, rowed_on desc, created_at desc)`.
- `coach_suggestions`: `id`, `user_id default auth.uid()`, `session_id uuid unique references sessions on delete cascade`, `suggestion jsonb not null`, `is_default boolean`, `default_reason text` (`model_failed` | null), `attempts smallint`, `model text`, `created_at`.
- RLS on both: `sessions` select/insert/update/delete own; `coach_suggestions` select/insert/delete own (no update policy — stored suggestions are immutable). The `coach_suggestions` insert check also requires the referenced session to belong to the caller (`exists (select 1 from public.sessions s where s.id = coach_suggestions.session_id and s.user_id = (select auth.uid()))` — qualify the column so it cannot be shadowed inside the subquery).

#### 2. Types and entities

**Files**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Regenerate DB types (`npx supabase gen types typescript --linked`) after the user's `db push`; add `RowingSession` (camelCase entity: type, rowedOn, distanceM, durationS, splitsS, spm/dps ranges, watts, boat, comment, id, createdAt).

**Contract**: `RowingSession` and a row→entity mapper used by every loader.

#### 3. Session input rules

**File**: `src/lib/services/sessions/rules.ts` (+ `rules.test.ts`)

**Intent**: zod schema for the log form: parse time with `parseTime`, splits as whitespace/comma separated times, SPM and DPS as "min–max" or a single value, decimal comma accepted, type-specific fields rejected or ignored for the other type.

**Contract**: `SessionInputSchema` (form strings → normalised values matching the DB checks); reuse `firstIssueMessage`.

#### 4. Loader

**File**: `src/lib/services/sessions/load.ts`

**Intent**: Load one session by id, the user's history *as of that session*, and the stored suggestion for a session; same `loadFailed` style as `loadProfileAndGoals`. History is relative to the session (not "latest overall"), so a session opened or generated later — or logged with an earlier `rowed_on` — always gets the same analysis and limits (review F2).

**Contract**: `loadSession(supabase, id)`; `loadSessionsUpTo(supabase, session, limit = 10)` → sessions up to and including `session` in the agreed order (`rowed_on` desc, `created_at` desc); the analysis uses the strictly-earlier part, the limit context the inclusive part; `loadLatestSession(supabase)` for the dashboard link; `loadStoredSuggestion(supabase, sessionId)`.

#### 5. Endpoint and pages

**Files**: `src/pages/api/sessions.ts`, `src/pages/sessions/new.astro`, `src/pages/sessions/[id].astro`, `src/components/sessions/SessionForm.tsx`, `src/middleware.ts`

**Intent**: Form POST following `api/goals.ts` (auth redirect, guarded `formData()`, zod → `?error=`, insert with explicit `user_id`, redirect `/sessions/<id>`). New-session page with erg/water switch showing only that type's fields, date defaulting to today. Session page shows the logged values (404-style message when not found/not owned). Add `/sessions` to `PROTECTED_ROUTES`.

**Contract**: `POST /api/sessions` → 302 `/sessions/<id>` | 302 `/sessions/new?error=<msg>` | 302 `/auth/signin`.

#### 6. Access and smoke checks

**Files**: `scripts/rls-check.mjs`, `scripts/smoke.mjs`

**Intent**: rls-check steps for both tables mirroring goals (A inserts/sees own; B select/update/delete 0 rows; B insert owned by A rejected; owner move rejected; B cannot insert a suggestion for A's session; anonymous sees none). Smoke steps: anonymous `/sessions/new` redirect, page renders, valid log → `/sessions/<id>`, invalid log → error redirect, session page renders.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes (ignoring CRLF-only messages locally): `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Access rules hold for both new tables: `npm run rls-check` (CI smoke job)
- Smoke passes including session logging: `npm run smoke` (CI smoke job)
- Generated types match migrations (CI types check)

#### Manual Verification:

- Migration pushed to the cloud project by the user and RLS shown enabled on both tables in the Supabase dashboard
- Logging an erg and a water session on a phone-sized screen works, with only the right fields per type, and lands on the session page showing the values

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Metrics and safety-limits engine

### Overview

Pure TypeScript, fully unit-tested: compute the analysis and the limit context from sessions + goals, validate a suggestion against the limits, and build the clamped safe default. Show the analysis on the session page.

### Changes Required:

#### 1. Metrics

**File**: `src/lib/services/coaching/metrics.ts` (+ `metrics.test.ts`)

**Intent**: Compute per-session metrics and the analysis vs the up-to-3 previous same-type sessions, with PRD labels and the technique verdict, exactly as in the decision record.

**Contract**: `sessionMetrics(session) → { pacePer500s, splitDriftS | null, spmMid | null, dpsMid | null }`; `analyseSession(session, history) → { baselineCount: 0–3, metrics, deltas (null when no baseline value), labels: ("dpsHugeImprovement" | "dpsClearDrop" | "paceGoodImprovement" | "techniqueLimitingEfficiency")[] }`. Same input → identical output (rounded to 0.1).

#### 2. Limits

**File**: `src/lib/services/coaching/limits.ts` (+ `limits.test.ts`)

**Intent**: Derive the limit context for the next suggestion and validate a suggestion against it.

**Contract**:
- `limitContext(session, history, goals) → { volumeCaps: Partial<Record<SessionType, { distanceM, minutes }>>, maxSpmCap: 32 | null, mustBeEasy: boolean, easyPaceFloorS: Partial<Record<SessionType, number>> }`
- `validateSuggestion(suggestion, context) → Violation[]` where each violation has a code (`volume_distance`, `volume_time`, `no_baseline_for_type`, `rate_cap`, `not_easy_rate`, `not_easy_pace`) and a human message used as retry feedback.
- `safeDefaultFor(sessionType, context)` — clamped default; `validateSuggestion(safeDefaultFor(...)) === []` for every context.

#### 3. Suggestion schema

**File**: `src/lib/services/coaching/schema.ts`

**Intent**: Add the required summary numbers to the model's answer and keep readable fields; let the stored/default shape allow `totalDistanceM: null`.

**Contract**: `CoachingSuggestionSchema` gains `totalDistanceM: int`, `totalMinutes: number`, `targets.maxSpm` required, `targets.fastestPacePer500s: number | null` (with `.describe()` texts); a `SuggestedSession` type for stored/default suggestions with `totalDistanceM: number | null`. Update F-01 tests accordingly.

#### 4. Analysis on the session page

**Files**: `src/pages/sessions/[id].astro`, `src/components/sessions/SessionAnalysis.astro`

**Intent**: Load profile/goals + `loadSessionsUpTo(session)`, compute the analysis server-side and render metrics with deltas, "vs your last N" and labels; first session shows values only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including: same data twice → same metrics; an older session's analysis and limits ignore sessions ordered after it; DPS −0.3 → `dpsClearDrop` and `maxSpmCap` 32; distance+time-only session → pace only, no crash; first session → no deltas but volume caps from itself; 2 hard (erg then water) → `mustBeEasy`; no goal → not hard; boundary values (−0.3, +0.5, −5, exactly 110 %) behave as decided; safe default passes every context: `npm test`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- After logging 4 sessions of one type with varied numbers, the session page shows deltas vs "your last 3" and the expected labels (e.g. a DPS drop of 0.3 m shows "clear drop")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Coaching agent service

### Overview

Verify the SDK combination against the real API, then replace the single call with a small tool-using agent whose every final answer is validated against the limits inside the retry loop.

### Changes Required:

#### 1. Spike (not committed)

**File**: scratch script outside the repo (or untracked), key from `.dev.vars`

**Intent**: Confirm `client.beta.messages.toolRunner` with one `betaZodTool`, `output_config.format`, `fallbacks: "default"` and the beta header returns a parseable final answer from `claude-opus-5-5`; note turns and wall time. Record the result (works / use fallback design) in this phase block.

**Spike result (2026-10-08): works — fallback design not needed.** `toolRunner` + one `betaZodTool` + `output_config: { effort: "low", format: betaZodOutputFormat(schema) }` + `fallbacks: "default"` + beta `server-side-fallback-2026-07-01` + `tool_choice: auto` + `max_iterations: 4` on `claude-opus-5-5`: 2 model requests (turn 1 `tool_use`, tool called once; turn 2 `end_turn` with a valid JSON text block that parsed with the zod schema), ~12.7 s wall. An `AbortSignal` passed as the runner's request option aborted `runUntilDone()` with `APIUserAbortError` after ~316 ms. Observed: the model may suggest the other session type — covered by `no_baseline_for_type` and a prompt instruction.

#### 2. Tools

**File**: `src/lib/services/coaching/tools.ts` (+ `tools.test.ts`)

**Intent**: Three read-only tools over a preloaded `CoachingContext` (profile, goals, recent sessions, current session, analysis, limit context): `getAthleteProfile`, `getTrainingHistory({ limit ≤ 10 })`, `getSessionMetrics()` (analysis + the limits the next session must respect). Comments are fenced as `<rower_comment>` in tool output.

**Contract**: `buildCoachingTools(context)` → `betaZodTool[]`; each tool's `run` is pure over the context (no I/O).

#### 3. Agent service

**File**: `src/lib/services/coaching/getCoachingSuggestion.ts` (+ test)

**Intent**: New input `CoachingContext`; per attempt run the tool runner (`tool_choice` auto, `max_iterations` 4, effort low, fallbacks default), parse the final answer with `CoachingSuggestionSchema`, validate with `validateSuggestion`; a parse failure, refusal, error or violation fails the attempt, and attempt 2 receives the violation messages. After 2 failures return `safeDefaultFor(session.type, context)` with `defaultReason: "model_failed"`. Keep logging style (no bodies, no keys). System prompt names the tools, the limits and the data-not-instructions rule.

**Contract**: `getCoachingSuggestion(context, { client, model, signal? }) → { suggestion: SuggestedSession, isDefault, defaultReason: "model_failed" | null, attempts: 1 | 2, model }`. `CoachingClient = { beta: { messages: { toolRunner(params, options?): { runUntilDone(): Promise<BetaMessage> } } } }` (plus `parse` only if the fallback design is adopted) — the SDK runner is a class with private fields, so tests fake this narrow shape. Use `runUntilDone()` (`BetaToolRunner.ts:582`); `done()` never resolves unless the runner is iterated. Parse the final message's text block with `CoachingSuggestionSchema`; no final text block, or `max_iterations` reached while the model still wants tools, is a failed attempt (review F4). The optional `signal` is forwarded to every request; when it aborts, stop and return the clamped default with `model_failed` (review F3). User-written fields stay length-limited before reaching the model.

#### 4. Remove the try-it endpoint

**File**: delete `src/pages/api/coaching/try.ts`

**Intent**: It calls `getCoachingSuggestion` with the old `CoachingInput` (`try.ts:6-7,49`), so it must go in this phase or Phase 3's type check and build fail (review F1). `allowlist.ts` and `COACH_TRY_EMAILS` stay until the Phase 4 cutover.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including: aborted signal → clamped default with `model_failed`; `max_iterations` reached without a final answer → failed attempt; valid first answer → `attempts` 1; limit-breaking first answer → retry receives violation feedback; two violations → clamped safe default with `model_failed`; refusal / thrown error / unparseable output each fail an attempt; tools return fenced comments and never more than 10 sessions; request params (`max_iterations` 4, `tool_choice` auto, fallbacks, beta header): `npm test`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- Spike result recorded in this phase block (works as designed, or fallback design adopted)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Suggestion endpoint, UI and cutover

### Overview

Expose the agent to the session page, store results, guard cost with the allowlist (the try-it endpoint was removed in Phase 3).

### Changes Required:

#### 1. Suggestion endpoint

**File**: `src/pages/api/sessions/[id]/suggestion.ts`

**Intent**: JSON POST. 401 when signed out; 404 when the session is not visible; stored suggestion → return it; not allowlisted → safe default with `defaultReason: "not_allowed"` (not stored); no client → default with `"not_configured"` (not stored); otherwise build `CoachingContext` from loaders (`loadSessionsUpTo` for this session), run the agent with a 90 s overall deadline (`AbortSignal.timeout(90_000)`; on deadline the agent returns the clamped default with `model_failed`, which is stored like any other result — review F3), insert into `coach_suggestions` (on unique conflict, return the stored row), return it.

**Contract**: `POST /api/sessions/<id>/suggestion` → `200 { suggestion, isDefault, defaultReason, stored }` | 401 | 404 | 500 (load/insert failure, logged as code + message only).

#### 2. Island and page

**Files**: `src/components/sessions/SuggestionPanel.tsx`, `src/pages/sessions/[id].astro`

**Intent**: Render the stored suggestion immediately when present; otherwise POST on mount with a "Coach is thinking… this can take up to about a minute and a half" state (accessible live region), then show structure, targets (rate cap, pace), focus, reason and technique tip; a default shows a visible "Safe default" label with the reason text; network/5xx errors show a Retry button.

#### 3. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: "Log a session" button and a link to the latest session (when any).

#### 4. Allowlist cutover and cleanup

**Files**: `astro.config.mjs`, `src/lib/services/coaching/allowlist.ts`, `.env.example`, local `.dev.vars` / `.env` (user's copies), `AGENTS.md` if it names `COACH_TRY_EMAILS`

**Intent**: Rename env `COACH_TRY_EMAILS` → `COACH_EMAILS` (server, secret, optional). (The try-it endpoint is already removed in Phase 3.)

**Contract**: unset `COACH_EMAILS` → nobody gets model suggestions.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Extend `request()` to read a JSON body; add steps: suggestion for own session → 200 with `isDefault: true` (no key / not allowlisted in CI); suggestion for a random id → 404; signed-out suggestion → 401.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- Smoke passes including suggestion endpoint steps: `npm run smoke` (CI smoke job)
- No references to `COACH_TRY_EMAILS` or `api/coaching/try` remain: `git grep -n "COACH_TRY_EMAILS\|coaching/try" -- src scripts astro.config.mjs .env.example` returns nothing
- CI run on main is green (ci, smoke, deploy)

#### Manual Verification:

- User set `COACH_EMAILS` as a Cloudflare Worker secret (Type: Secret) and a monthly spend limit on the Anthropic workspace
- On the deployed app (phone), an allowlisted rower logs a session, sees the analysis instantly and a real suggestion after the waiting state; reloading shows the same suggestion without a new call (`wrangler tail` shows no second model request)
- A suggestion after a water session with a 0.3 m DPS drop has max rate ≤ 32 spm
- A non-allowlisted account sees the labelled safe default
- Latency and CPU noted from `wrangler tail` (no "Exceeded CPU Limit" / 1102)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `sessions/rules.test.ts`: time/splits/range parsing, decimal comma, type-specific fields, limits matching DB checks.
- `metrics.test.ts`: determinism, 0/1/2/3+ previous sessions, distance+time only, drift sign, label boundaries.
- `limits.test.ts`: volume caps incl. the new session, both quantities, no-baseline type, rate cap 32, 2-hard across types, no goal = not hard, easy rate/pace checks, safe default passes all contexts.
- `tools.test.ts`, `getCoachingSuggestion.test.ts`: fake client; retry with feedback; default reasons; fencing.

### Integration Tests:

- `rls-check`: both new tables, including cross-user suggestion insert.
- `smoke`: log session, session page, suggestion endpoint 200/401/404 without a key.

### Manual Testing Steps:

1. Log a first erg session (distance + time only) → page shows pace, no deltas; suggestion within +10 % of that session's distance and time.
2. Log three more erg sessions with splits and SPM → deltas "vs your last 3", drift sign correct.
3. Log two water sessions at or faster than goal pace + 5 s, the second with DPS 0.3 m below baseline → suggestion is easy (≤ 22 spm, no hard pace) and ≤ 32 spm.
4. Reload a session page → same suggestion, no new model call.
5. Sign in as a non-allowlisted account → safe default labelled "not enabled".

## Performance Considerations

- Analysis is computed in code per page view (≤ 10 sessions) — negligible.
- A suggestion takes several model turns (estimate 15–25 s, measured in phase 3/4); the stored result avoids repeat calls. Workers free plan: watch CPU (21 ms measured for one call) and the 50-subrequest limit (~13 worst case).

## Migration Notes

- New tables only; no existing data changes. The user pushes the migration (`npx supabase db push` in their own terminal) before the phase 1 commit; Claude regenerates types with `--linked`.
- Cloudflare secret rename: add `COACH_EMAILS`, then delete `COACH_TRY_EMAILS` after phase 4 deploys.

## References

- Research: `context/changes/first-session-suggestion/research.md`
- PRD Business Logic and US-01: `context/foundation/prd.md`
- Roadmap S-02: `context/foundation/roadmap.md`
- F-01 service: `src/lib/services/coaching/getCoachingSuggestion.ts:35-138`
- S-01 patterns: `supabase/migrations/20261008151626_create_profiles_and_goals.sql`, `src/pages/api/goals.ts`, `src/lib/services/profile/load.ts:7-56`
- Lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session logging and storage

#### Automated

- [x] 1.1 Unit tests pass — 5c2665b
- [x] 1.2 Lint passes (ignoring CRLF-only messages locally) — 5c2665b
- [x] 1.3 Type check passes — 5c2665b
- [x] 1.4 Build passes — 5c2665b
- [x] 1.5 Access rules hold for both new tables — 5c2665b
- [x] 1.6 Smoke passes including session logging — 5c2665b
- [x] 1.7 Generated types match migrations — 5c2665b

#### Manual

- [x] 1.8 Migration pushed to the cloud project by the user and RLS shown enabled on both tables — 5c2665b
- [x] 1.9 Logging an erg and a water session on a phone-sized screen works — 5c2665b

### Phase 2: Metrics and safety-limits engine

#### Automated

- [x] 2.1 Unit tests pass for metrics, limits and safe default — dcbe43f
- [x] 2.2 Lint, type check and build pass — dcbe43f

#### Manual

- [x] 2.3 Session page shows deltas vs "your last 3" and expected labels — dcbe43f

### Phase 3: Coaching agent service

#### Automated

- [x] 3.1 Unit tests pass for tools and agent service
- [x] 3.2 Lint, type check and build pass

#### Manual

- [x] 3.3 Spike result recorded in the phase block

### Phase 4: Suggestion endpoint, UI and cutover

#### Automated

- [ ] 4.1 Unit tests pass
- [ ] 4.2 Lint, type check and build pass
- [ ] 4.3 Smoke passes including suggestion endpoint steps
- [ ] 4.4 No references to COACH_TRY_EMAILS or api/coaching/try remain
- [ ] 4.5 CI run on main is green

#### Manual

- [ ] 4.6 COACH_EMAILS secret and Anthropic spend limit set
- [ ] 4.7 Deployed flow works on a phone with a stored suggestion on reload
- [ ] 4.8 DPS-drop suggestion caps rate at 32 spm
- [ ] 4.9 Non-allowlisted account sees the labelled safe default
- [ ] 4.10 Latency and CPU noted with no CPU-limit errors
