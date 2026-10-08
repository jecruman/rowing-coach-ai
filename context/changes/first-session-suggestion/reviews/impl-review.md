<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Session Suggestion Implementation Plan

- **Plan**: context/changes/first-session-suggestion/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria re-run 2026-10-08: `npm test` 170/170, lint 0 non-CRLF issues, `astro check` 0 errors, build OK, cutover grep empty; CI runs for p1–p4 green (rls-check and smoke incl. suggestion steps). All 11 decision-record rules verified MATCH against code; no "What We're NOT Doing" violations; only drift is the 30-row history window (F7).

## Findings

### F1 — Comment fence can be rebuilt by a nested tag

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/coaching/tools.ts:17,26
- **Detail**: `fenceComment` strips `<rower_comment>` tags with a single `replace`, so `</rower_</rower_comment>comment>` becomes `</rower_comment>` and a comment can close its fence and place text outside it. Violates lessons.md "User text sent to the model must be validated and fenced". Impact is limited to the user's own suggestion and numbers are still validated, but free-text fields can be steered.
- **Fix**: Escape `<` and `>` in the comment (e.g. to `‹`/`›` or `&lt;`/`&gt;`) so no tag can form, and add the nested case to tools.test.ts.
- **Decision**: FIXED — `<`/`>` escaped to ‹ › inside the fence; nested-tag test (break-checked: 2 tests red without the fix)

### F2 — Concurrent requests each pay for a full agent run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sessions/[id]/suggestion.ts:61-114
- **Detail**: The endpoint checks for a stored row, runs the agent, then inserts; nothing claims the session first. Two tabs, a dev double-mount, or Retry while the first request still runs server-side each run up to 8 model requests; the unique conflict discards the loser only after it was paid for. A non-unique insert failure also throws the paid result away.
- **Fix A**: Claim the session before the model call — new migration adding a `pending` state (e.g. `status` column, nullable `suggestion`), insert the claim first, call the model only when the claim succeeds, then update the row.
  - Strength: At most one agent run per session, whatever the client does.
  - Tradeoff: Migration + update policy (stored rows stop being insert-only), stale-claim handling if a Worker dies mid-run.
  - Confidence: MED — standard pattern, but stale claims need a timeout rule.
  - Blind spot: Workers behaviour when the client disconnects.
- **Fix B ⭐ Recommended**: Accept for the family MVP (2 allowlisted users + Anthropic spend limit) and record it as a known risk in the roadmap's S-02 notes / Open Questions, to fix before sharing beyond the family (same trigger as PRD OQ1).
  - Strength: No new schema or state now; the cost guard already bounds exposure.
  - Tradeoff: A double request costs one extra suggestion (~cents).
  - Confidence: HIGH — exposure limited by the allowlist.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix B) — family MVP risk recorded in roadmap Open Roadmap Question 1

### F3 — Delete policy allows unlimited regeneration

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261008200000_create_sessions_and_suggestions.sql:107-109
- **Detail**: `coach_suggestions_delete_own` lets a user delete their stored suggestion via PostgREST and POST again — unlimited model calls per session, contradicting "No regeneration of a stored suggestion". Cleanup is already covered by `on delete cascade` from sessions. (Direct inserts of arbitrary own suggestion JSON are also possible but only affect the user's own data.)
- **Fix**: New migration dropping `coach_suggestions_delete_own` (user pushes it first, per lessons.md), plus an rls-check step "A delete of own suggestion affects 0 rows".
- **Decision**: FIXED — migration 20261008220000_coach_suggestions_no_delete.sql + rls-check step

### F4 — Model output numbers and texts are unbounded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/coaching/schema.ts:11-35
- **Detail**: `totalMinutes`, `totalDistanceM`, `maxSpm` and the pace accept 0 or negatives (they pass `validateSuggestion`), and text fields have no `.max()`, so a malformed answer can be stored and shown.
- **Fix**: Add `.positive()` to minutes/distance/pace, `maxSpm` 10–60, and `.max()` (e.g. 300–600 chars) on text fields in the model schema; keep `SuggestedSessionSchema` parsing of stored rows compatible; add tests.
- **Decision**: FIXED — bounds on numbers and text in CoachingSuggestionSchema; schema.test.ts

### F5 — Deadline default is stored permanently

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sessions/[id]/suggestion.ts:22,104
- **Detail**: When the 90 s deadline hits, the clamped default is stored as `model_failed` and becomes final for that session — one slow upstream response permanently replaces coaching for it. This follows the plan (review F3 of the plan), but it's worth confirming now that the trade-off is visible.
- **Fix**: Return the deadline default unstored (`stored: false`) so a reload tries again; keep storing defaults caused by limit violations.
  - Strength: A transient slowdown doesn't lock in a default.
  - Tradeoff: A persistently slow upstream means repeated attempts (cost) on reloads.
  - Confidence: MED — depends on how often the deadline is hit (unmeasured, see F6).
  - Blind spot: Real latency on Workers.
- **Decision**: FIXED — deadline default returned unstored (`aborted` flag on the agent result)

### F6 — Latency and CPU (4.10) checked without evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 4.10
- **Detail**: 4.10 is ticked by user acceptance; the `wrangler tail` capture contained no model-call request (noted in change.md). Agent latency and CPU on Workers are unmeasured.
- **Fix**: Measure once with `wrangler tail` on a fresh allowlisted session and note the numbers in change.md (or leave as a known gap).
- **Decision**: FIXED — measured on production: 15.3 s wall, 24 ms CPU, outcome ok; reload made no model call (numbers in change.md)

### F7 — History window of 30 rows (drift, beneficial)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/sessions/[id].astro:22, src/pages/api/sessions/[id]/suggestion.ts:20
- **Detail**: Plan said `limit = 10`; both callers pass 30 so a mixed erg/water history still finds the last 3 of a type. Above 30 rows of the other type since the last same-type session, the baseline falls back to 0 (fails closed: cap from this session only).
- **Fix**: Record the 30-row window as a plan addendum.
- **Decision**: FIXED — plan addendum

### F8 — Small edge cases in error paths

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/sessions/new.astro:13; suggestion.ts stored parse; sessions/rules.ts splits
- **Detail**: (a) `?error=` text is reflected as typed (escaped, ≤ 200 chars) — a crafted link can show any message (same as the existing profile page); (b) a stored suggestion that no longer parses returns 500 on every request; (c) a splits field of only commas parses to `[]` and fails the DB check with a generic "Could not save" instead of a field error.
- **Fix**: (c) reject empty split lists in zod with a field message; leave (a) and (b) as known.
- **Decision**: FIXED (c) — on inspection already a field error (a comma only separates before a time); test documents it; (a) and (b) left as known
