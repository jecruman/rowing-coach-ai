<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Metric Trend

- **Plan**: context/changes/metric-trend/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Trend smoke step passes even when the trend read fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/smoke.mjs:172-176
- **Detail**: The signed-in step `trend page renders (DPS on erg opens water)` asserts only `status: 200`. A failed trend query still renders 200 with `ServerError` (same as `sessions/index.astro`), so a broken `.not(...)` filter would pass smoke. The step also never checks the "opens water" part of its name. Neighbouring steps assert on the HTML body (`smoke.mjs:146`, `:161`).
- **Fix**: Add an `html` predicate: the body does not contain "Could not load your sessions" and the Water picker carries `aria-current="true"`.
- **Decision**: FIXED — smoke step now asserts no load error and the active Water picker

### F2 — Split-drift window can show a wrong "Log at least 2" empty state

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/sessions/load.ts:218
- **Detail**: For drift the query only requires `splits_s is not null`. Single-split sessions pass that filter, then `sessionMetrics` gives them a null drift and they are dropped after the read. If most of the 20 newest sessions have one split, the page says "Log at least 2 … sessions with split drift" even though older sessions with drift exist. The plan accepted the shorter window ("do not over-fetch"), but not the misleading message.
- **Fix**: Keep the accepted window and make the drift empty state say "sessions with 2 or more splits".
- **Decision**: FIXED — drift empty state now says "with 2 or more splits"

### F3 — Shared `signed()` lives in a feature module

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/sessions/SessionAnalysis.astro:4
- **Detail**: Following the plan, the Analysis card now imports a general number formatter from `sessions/trend`. `formatTime`, the other display formatter, lives in `profile/rules.ts`. This is a layering issue only; nothing breaks. The plan itself chose this location.
- **Fix**: Move `signed()` (and its test) next to `formatTime` in `src/lib/services/profile/rules.ts`, and import it from there in both places.
- **Decision**: FIXED — signed() and its test moved to profile/rules; both callers import it from there

### F4 — Small unplanned additions on the trend page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/sessions/trend.astro:146-182, 223-225
- **Detail**: Two faint guide lines and a dot on the latest point in the SVG (from the dataviz skill's mark rules), plus an "All sessions" link at the bottom. The link was disclosed during implementation; the chart touches were not. Nothing on the NOT-doing list is affected (no JS, tooltips or library).
- **Fix**: Accept them, with a one-line note in the plan.
- **Decision**: FIXED — accepted; review addendum added to plan Phase 2
