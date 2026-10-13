<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Suggestion Done Loop

- **Plan**: context/changes/suggestion-done-loop/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

Automated criteria re-run 2026-10-12 on 0dee311: `npm test` 225/225, lint 0 non-CRLF issues, `astro check` 0 errors, build OK; CI on d60e645 green (rls-check 28/28 including suggestion_outcomes steps, smoke). Manual rows 1.7–1.11 and 2.6–2.8 confirmed by the user on cb448c4. All 8 decision rules in the plan verified MATCH; merge of main (S-03) did not break plan intent.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Rower-writable suggestion text reaches the model unfenced

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/coaching/tools.ts:43
- **Detail**: `describeAnswered` re-sends a marked suggestion's `structure` (up to 300 chars) to the model unfenced, assuming it is model-written. But `coach_suggestions_insert_own` lets any signed-in user insert their own row with arbitrary `suggestion` JSON directly via PostgREST (rls-check does exactly this), so the text is user-controllable. Before this change stored suggestions were only displayed, never sent to the model. Breaks the lessons.md rule "User text sent to the model must be validated and fenced". Blast radius is the rower's own coaching only; limits are still checked in TypeScript.
- **Fix**: Fence `structure` like `fenceComment` does (e.g. `<suggested_structure>…</suggested_structure>`, `<`/`>` escaped) and say in the tool description / system prompt that it is data, not instructions.
- **Decision**: FIXED — structure fenced in `<suggested_structure>` (capped, angle brackets escaped); tool description and system prompt updated; tests added in tools.test.ts

### F2 — A failed read on save silently drops a skip and its cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sessions.ts:56
- **Detail**: When the rower answers Skipped, `loadMarkableSuggestion` failing (`loadFailed` ignored → `mark = null`) or the mark insert failing (line 87, log only) saves the session without the mark. The next suggestion is then generated and permanently stored without the no make-up cap. This is what the plan specified ("a failed read drops the mark silently"), but it contradicts the fail-closed rule the same change applies in the suggestion endpoint, where a failed outcomes read returns 500 because it "would drop a skip". The parallel-submit race (unique conflict) is handled correctly and is fine to keep silent.
- **Fix**: When a mark was submitted and `loadMarkableSuggestion` reports `loadFailed`, redirect back to the form with "Could not save your answer — please try again" before inserting the session; keep the post-insert failure logged but surface a non-23505 failure as an `?error=` notice on the session page.
  - Strength: Matches the fail-closed rule in `api/sessions/[id]/suggestion.ts`; the rower's answer is never lost silently.
  - Tradeoff: A transient read error now costs the rower a resubmit; the session page needs a small notice path.
  - Confidence: MED — the read-failure part is a few lines; the post-insert notice needs a new query param on the session page.
  - Blind spot: The plan chose fail-open deliberately; confirm the rower would rather resubmit than lose a mark.
- **Decision**: FIXED — a failed markable read now redirects back to the form with an error before the session is saved; a non-23505 mark insert failure redirects to the saved session with an `?error=` notice (existing S-03 notice path)

### F3 — Markable-suggestion lookup is three sequential reads

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/sessions/load.ts:296
- **Detail**: `loadMarkableSuggestion` reads the latest session (300), then its stored suggestion (304), then its outcome (310) one after another. `/sessions/new` previously made no queries; saving a session with a mark is now 3 reads + 2 inserts in sequence, each a round trip from the Worker to Supabase.
- **Fix**: Replace the three reads with one embedded select on the latest session — `sessions.select("id, rowed_on, created_at, coach_suggestions(id, suggestion, suggestion_outcomes(outcome))")` ordered and limited to 1 — and keep the same `{ markable, loadFailed }` result.
  - Strength: The relationships are already generated as one-to-one in `database.types.ts`; one round trip instead of three on the log page and the save path.
  - Tradeoff: Nested embed parsing is less readable than reusing the existing loaders.
  - Confidence: MED — PostgREST nested embeds are typed by the generated types, but not yet used this deep in this repo.
  - Blind spot: Actual latency from Workers to Supabase was not measured; at family scale this may be imperceptible.
- **Decision**: FIXED — `loadMarkableSuggestion` is one request (latest session embedding `coach_suggestions (id, suggestion, suggestion_outcomes (outcome))`); embed validated against the live API (no PostgREST ambiguity); not covered by unit tests — confirm the log-form question once on a real account

### F4 — Session page adds a fourth sequential read for the mark

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/sessions/[id].astro:64
- **Detail**: The outcome is read after the `Promise.all` of session history, goals and stored suggestion, adding one more round trip to a frequently opened page.
- **Fix**: Embed `suggestion_outcomes(outcome)` in the `loadStoredSuggestion` select so the mark arrives with the suggestion.
- **Decision**: FIXED — `loadStoredSuggestion` embeds `suggestion_outcomes (outcome)` and returns `outcome` on `StoredSuggestion`; the page reads it from there; the separate `loadSuggestionOutcome` loader was removed (no other callers)

### F5 — Mark ordering and type are not enforced below the app

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261011120000_create_suggestion_outcomes.sql:24
- **Detail**: The insert policy checks ownership of both rows but not that the logged session is dated on/after the suggested one, nor its type. A direct PostgREST insert, or (now that S-03 is merged) editing a marked session's date afterwards, can make "done" point to an earlier session. Limits can only get tighter (the skip cap only adds violations and lowers the default), and only for the rower's own sessions; the effect is a misleading history for the model. The plan left S-03 reordering out of scope.
- **Fix A ⭐ Recommended**: Accept and document it as a known limitation in the plan/roadmap notes.
  - Strength: No safety impact — verified that the skip cap can only tighten limits.
  - Tradeoff: History shown to the coach can be inconsistent after a date edit.
  - Confidence: HIGH — the only consumers are the cap (tighten-only) and the model's context.
  - Blind spot: Future features (e.g. S-05 trends) might read marks and assume ordering.
- **Fix B**: Re-check the date in the S-03 edit endpoint when the session carries a mark (and optionally a BEFORE INSERT trigger).
  - Strength: Keeps "done = the suggested session" true everywhere.
  - Tradeoff: Touches S-03's edit flow and adds DB logic for a rare case.
  - Confidence: MED — straightforward, but adds coupling between the two slices.
  - Blind spot: Type changes are already blocked by S-03 edit; only the date path is open.
- **Decision**: ACCEPTED (Fix A) — documented as a known limitation in plan.md "Review Addendum"

### F6 — Small unplanned additions and drifts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/sessions/SessionForm.tsx:132
- **Detail**: The form checks the backdate rule client-side (not in the plan; mirrors the server). Also: the mark id uses `z.guid()` rather than a strict uuid (rules.ts:168), and `skip_distance` doesn't round the cap side (limits.ts:191). All harmless — the server re-check and whole-metre distances cover them.
- **Fix**: Note the client-side check as a plan addendum; no code change needed.
- **Decision**: FIXED — client-side check noted in plan.md "Review Addendum" (alongside the F2 behaviour change); no code change
