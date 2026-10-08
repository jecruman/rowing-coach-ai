<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First Session Suggestion Implementation Plan

- **Plan**: context/changes/first-session-suggestion/plan.md
- **Mode**: Deep
- **Date**: 2026-10-08
- **Verdict**: REVISE → SOUND after triage (all 6 fixed in plan)
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding
Grounding: 10/10 paths ✓, 4/4 symbols ✓, brief↔plan ✓ (extra hit: `.env.example` names `COACH_TRY_EMAILS`)

## Findings

### F1 — Phase 3 breaks the build while try.ts still calls the old service

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3 (Agent service) vs Phase 4 §4 (cleanup)
- **Detail**: Phase 3 changes `getCoachingSuggestion` to take a `CoachingContext` and narrows `CoachingClient` to the tool runner, but `src/pages/api/coaching/try.ts:6-7,49` still calls it with the old `CoachingInput` until Phase 4 deletes it. Phase 3's `npx astro check` / `npm run build` gates would fail.
- **Fix**: Move the deletion of `src/pages/api/coaching/try.ts` into Phase 3 (the allowlist rename stays in Phase 4, where the new endpoint uses it).
- **Decision**: FIXED

### F2 — Suggestion context is not "as of" the session

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 (Loader), Phase 4 §1 (endpoint)
- **Detail**: `loadRecentSessions(supabase, userId, limit)` returns the latest sessions overall. If a suggestion is generated for an older session (opened later, or logged with an earlier `rowed_on`), the volume cap and "2 hard in a row" would include sessions logged after it, and the suggestion would be checked against the wrong limits.
- **Fix**: Load history relative to the session: up to and including it in the agreed order (`rowed_on`, `created_at`); analysis uses the strictly-earlier part, the limit context the inclusive part. Contract: `loadSessionsUpTo(supabase, session, limit)`.
  - Strength: Analysis and limits are deterministic for a given session no matter when they're viewed.
  - Tradeoff: One more loader shape and a test for an older-session case.
  - Confidence: HIGH — follows directly from the decided ordering.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — No overall time budget for a suggestion

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §3, Phase 4 §2
- **Detail**: Worst case is 2 attempts × 4 turns × 60 s client timeout ≈ 8 min. A phone may drop the request, the island shows Retry, and a second request starts a second model run while the first may still insert.
- **Fix**: Give each suggestion request an overall deadline (e.g. 90 s, via an `AbortSignal` passed to the runner); on deadline, stop and return the clamped default with `model_failed`. The island's waiting state says it can take up to ~1.5 min.
  - Strength: Bounded cost and wait; the unique `session_id` already handles a duplicate insert.
  - Tradeoff: A slow but valid answer after 90 s is lost and replaced by the default.
  - Confidence: MED — real latency is only known after the Phase 3 spike.
  - Blind spot: Whether the SDK runner forwards an abort signal through every turn (check in the spike).
- **Decision**: FIXED

### F4 — Runner contract not pinned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3 Contract
- **Detail**: The runner is a class with private fields (cannot be faked structurally); the final message comes from `runUntilDone()` (`BetaToolRunner.ts:582`), not `done()`, which never resolves unless iterated. The plan says only "e.g. `beta.messages.toolRunner`" and doesn't say what happens when `max_iterations` ends without a final text answer.
- **Fix**: Pin `CoachingClient = { beta: { messages: { toolRunner(params): { runUntilDone(): Promise<BetaMessage> } } } }`; parse the final text block with `CoachingSuggestionSchema`; no final text / `max_iterations` reached = failed attempt.
- **Decision**: FIXED

### F5 — Migration details: array length check and policy column scope

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1
- **Detail**: `array_length(splits_s, 1)` is NULL for an empty array (a CHECK passes on NULL); the `coach_suggestions` insert check's unqualified `session_id` works today but is shadow-prone.
- **Fix**: Use `cardinality(splits_s) between 1 and 200` (null allowed) and qualify `coach_suggestions.session_id` in the policy.
- **Decision**: FIXED

### F6 — `.env.example` missed by cutover and its check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §4 and criterion 4.4
- **Detail**: `.env.example` names `COACH_TRY_EMAILS`; the plan says ".dev.vars example/docs" and the 4.4 grep covers only `src scripts astro.config.mjs`.
- **Fix**: Name `.env.example` in §4 and add it to the 4.4 grep paths.
- **Decision**: FIXED
