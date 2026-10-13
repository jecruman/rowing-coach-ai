<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Metric Trend (round 2)

- **Plan**: context/changes/metric-trend/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations
- **Previous round**: `reviews/impl-review-round1.md` (4 findings, all fixed; fixes reviewed here in the working tree, not yet committed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Plan text out of date with the code

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/metric-trend/plan.md:123-127, 171; plan.md Phase 1 contract
- **Detail**: Phase 2 change #2 still says `signed()` moves into `trend.ts`, and Testing Strategy lists its test in `trend.test.ts`. Both are superseded by the review addendum: it now lives in `profile/rules.ts`. The Phase 1 contract shows `buildTrend(sessions, metric)`; the code takes an explicit `type` too. The plan also never mentions that clicking Erg while on DPS switches to pace. All three were adapted on purpose; only the plan text lags.
- **Fix**: Extend the Phase 2 review addendum with the `buildTrend(..., type)` signature and the DPS→Erg→pace rule, and point the Testing Strategy `signed` line at `profile/rules.test.ts`.
- **Decision**: FIXED — plan addendum extended (buildTrend type arg, DPS→Erg→pace), signed() lines point at profile/rules

### F2 — Round-1 fixes not yet verified by CI smoke

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:172-181
- **Detail**: The stricter signed-in trend smoke check and the other round-1 fixes are uncommitted. Tests (243), type check, lint and build pass locally, and both reviewers traced the regex against the rendered markup, but smoke can only run in CI (no local Supabase). Progress row 2.4 is ticked from the earlier, weaker step.
- **Fix**: Commit the round-1 fixes and push to PR #3, then confirm the CI smoke job is green.
- **Decision**: FIXED — review fixes committed and pushed to PR #3 for the CI smoke run
