<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session History

- **Plan**: context/changes/session-history/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes: every planned change is MATCH. The shared helpers `sessionFormFields` / `toSessionColumns` and the refactor of `src/pages/api/sessions.ts` are unplanned but serve the plan's "update the same columns as the insert" (no behaviour change). Nothing in "What We're NOT Doing" is violated. Cross-site POSTs to the new endpoints are blocked by Astro's default Origin check, ids are validated as uuids, redirect targets are fixed paths, and no new path triggers extra model calls. Automated criteria: lint, 200 unit tests, astro check, build pass locally; ci + smoke (incl. rls-check) pass on PR #1.

## Findings

### F1 — Editing while a suggestion is being generated hides the "edited" note

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/sessions/[id].astro (editedAfterSuggestion) with src/pages/api/sessions/[id]/suggestion.ts
- **Detail**: The suggestion endpoint reads the session, waits up to 90 s for the model, then inserts; `coach_suggestions.created_at` is set at insert. An edit saved during that wait gets an `updated_at` earlier than the suggestion's `created_at`, so the page shows no note although the suggestion (and its limits) used the old values. The Edit link is visible while "Coach is thinking…" runs, so this is reachable.
- **Fix A ⭐ Recommended**: Record the session version the suggestion was built from: add `coach_suggestions.session_updated_at` (migration, nullable for existing rows), set it from the session the endpoint read, and compare `session.updatedAt > session_updated_at ?? created_at`.
  - Strength: Exact for every interleaving; keeps the suggestion immutable and adds no model calls.
  - Tradeoff: Introduces a migration (plan said none) — lessons.md rule applies: `db push` + regenerate types before merge.
  - Confidence: HIGH — a direct encoding of "based on which version".
  - Blind spot: None significant.
- **Fix B**: Accept the race for the family MVP and note it in the roadmap's accepted risks.
  - Strength: No schema change; the window is ≤ 90 s and needs an edit mid-generation.
  - Tradeoff: A stale suggestion can appear current in that case.
  - Confidence: MED — depends on how often edits follow logging immediately.
  - Blind spot: Typo fixes are most likely right after logging — exactly when the suggestion is generating.
- **Decision**: FIXED via Fix A — migration 20261012090000 adds coach_suggestions.session_updated_at, set by the suggestion endpoint from the session it read; the page compares against it (falls back to created_at for older rows). Needs `npx supabase db push` before merge.

### F2 — Edit endpoint silently redirects when Supabase is not configured

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/sessions/[id].ts:31-33
- **Detail**: Every other form endpoint (goals, profile, sessions, delete) redirects back with `?error=Supabase is not configured`; this one goes to `/sessions` without explanation.
- **Fix**: Redirect to the edit page with that error (after a uuid check on the id), matching the other endpoints.
- **Decision**: FIXED — edit endpoint validates the uuid first, then redirects to the edit page with "Supabase is not configured".

### F3 — Deleting a missing or foreign session shows "Session deleted"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/sessions/[id]/delete.ts:32-41
- **Detail**: A valid uuid that matches no row of the caller deletes 0 rows without error and lands on `/sessions?deleted=1`. The plan said plain `/sessions`. Returning plain `/sessions` for 0 rows leaks nothing (missing and foreign look the same).
- **Fix**: `.select("id")` on the delete; redirect to `/sessions?deleted=1` only when one row was deleted, otherwise `/sessions`.
- **Decision**: FIXED — delete returns the deleted row; "?deleted=1" only when one row was deleted.

### F4 — Suggestion endpoint logs a false error when the session is deleted mid-generation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sessions/[id]/suggestion.ts (insert)
- **Detail**: Deleting during the ≤ 90 s generation makes the insert fail the RLS/foreign-key check; the endpoint logs "insert failed" and returns 500. Nothing is stored; one model call is spent.
- **Fix**: Map that insert failure to 404 "Session not found" without the error log.
- **Decision**: FIXED — a failed suggestion insert re-checks the session; gone → 404 "Session not found" without the error log.

### F5 — Stale-note comparison is inline and untested

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/sessions/[id].astro (editedAfterSuggestion)
- **Detail**: The timestamp comparison (parsed instants, PostgREST microseconds) lives in the page with no unit test.
- **Fix**: Move it into a small helper in `src/lib/services/sessions/` with unit tests (equal, later, earlier, differing fraction digits).
- **Decision**: FIXED — comparison moved to src/lib/services/sessions/staleness.ts with unit tests.

### F6 — Round-trip tests miss two value shapes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/sessions/rules.test.ts
- **Detail**: No case for a split ≥ 1 h ("1:02:30") and none for a stored comment with `\n` (a browser resubmits `\r\n`, which would count as a change — only for comments not saved via the form).
- **Fix**: Add both cases; normalise `\r\n` → `\n` in the comment comparison if the second fails.
- **Decision**: FIXED — added split ≥ 1 h and CRLF/LF comment tests; comment comparison now normalises CRLF to LF.

### F7 — Manual checks ticked on a general confirmation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.5–3.7
- **Detail**: Rows were ticked after "sessions, edit and delete work fine". Paging across > 20 sessions (1.6), the stale note vs. no-op save (2.6) and a suggestion after deleting (3.7) were not mentioned specifically.
- **Fix**: Spot-check 1.6, 2.6 and 3.7 before merge, or accept the smoke coverage for them.
- **Decision**: ACCEPTED — user confirmed list, edit and delete work; paging, edited-note and suggestion-after-delete rely on that confirmation plus smoke coverage.
