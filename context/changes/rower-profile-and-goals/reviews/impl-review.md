<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rower Profile and Goals Implementation Plan

- **Plan**: context/changes/rower-profile-and-goals/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria re-run 2026-10-08: `npm test` 54/54, `npx astro check` 0 errors, lint 0 real problems (CRLF-only excluded), build OK, deployed anonymous `/profile` → 302, latest CI run green (rls-check 12/12, smoke 13/13), cloud migration `20261008151626` local = remote. Drift check: every planned change MATCH; no MISSING; no "What We're NOT Doing" item implemented. RLS: four per-operation policies per table for `authenticated`, update has WITH CHECK, no anon access; endpoints take the user from `locals.user`; `created_at` never overwritten; clear deletes only the validated type.

## Findings

### F1 — A failed read looks like "no data" and invites overwriting

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/profile/load.ts:27-39; src/pages/profile.astro:25; src/pages/dashboard.astro:11
- **Detail**: When the profile/goals query fails, the loader logs it and returns the same shape as "nothing saved". `/profile` then shows blank forms the rower can save over real data, and the dashboard says "Set up your profile".
- **Fix**: Return a `loadFailed` flag from the loader; when set, `/profile` shows a "Could not load your data — try again" banner and hides the forms, and the dashboard shows the banner instead of the setup prompt.
  - Strength: A transient database error can no longer lead to accidental overwrites or a misleading prompt.
  - Tradeoff: One more state in two pages.
  - Confidence: HIGH — loader and both call sites read.
  - Blind spot: No automated test for the failure path (page-level).
- **Decision**: FIXED — load.ts returns loadFailed; /profile shows a banner and hides the forms; dashboard shows the banner

### F2 — Decimal comma rejected with a misleading message

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/profile/rules.ts:65, :81, :7
- **Detail**: Weight `70,5` fails with "at most one decimal", and time `7:30,5` is rejected; `inputMode="decimal"` shows a comma key on Polish keyboards.
- **Fix**: Normalise a single `,` to `.` before parsing weight and time tenths; add tests for `70,5` and `1:55,5`.
- **Decision**: FIXED — single decimal comma accepted for weight and time tenths; 4 new tests (break-checked)

### F3 — Non-form POST bodies cause an unhandled 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile.ts:19; src/pages/api/goals.ts:20
- **Detail**: `request.formData()` throws on a non-form content type (same pre-existing pattern as `api/auth/signin.ts`).
- **Fix**: Wrap `formData()` in try/catch and redirect to `/profile?error=Invalid form submission`.
- **Decision**: FIXED — formData() failures redirect to /profile?error=Invalid form submission

### F4 — `?error=` text can be crafted by a link

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/profile.astro:20
- **Detail**: The error query value is shown verbatim (escaped — not XSS), so a crafted link can show arbitrary red text to a signed-in user.
- **Fix**: Cap the displayed error at 200 characters (endpoint messages are short).
- **Decision**: FIXED — displayed error capped at 200 characters on /profile

### F5 — Access check doesn't test moving your own row to another user

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/rls-check.mjs
- **Detail**: The update policy's WITH CHECK (no changing `user_id`) is present but untested.
- **Fix**: Add a step: A PATCHes its own profile/goal to `user_id = B` → rejected (non-2xx), A's row unchanged.
- **Decision**: FIXED — rls-check adds owner-move steps for profile and goal (verified in CI on push)

### F6 — Deploys can reach production before the schema does

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml (deploy job)
- **Detail**: Migrations reach production only by a manual `supabase db push`; a merge that adds a migration plus code using it deploys the code regardless. This slice handled it by pushing in Phase 1, but nothing records the rule for later slices.
- **Fix**: Record a lesson: run `supabase db push` (and regenerate types) before merging code that depends on a new migration.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Ship the schema before the code that needs it — CI step compares regenerated types with src/db/database.types.ts

### F7 — Unplanned helper and shared-component props

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/profile/load.ts; src/components/auth/FormField.tsx; src/components/auth/SubmitButton.tsx
- **Detail**: Benign extras reported during implementation: shared `loadProfileAndGoals`/`ageFromBirthYear`, `FormField` `inputMode`/`autoComplete`, `SubmitButton` `name`/`value` (backward-compatible).
- **Fix**: Add a short addendum to plan.md recording them.
- **Decision**: FIXED — addendum added to plan.md

### F8 — AGENTS.md says there is no unit-test runner

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md (Testing section)
- **Detail**: Stale since F-01 added Vitest; this change adds `npm run rls-check` and new smoke steps too. Agents reading AGENTS.md get the wrong testing guidance.
- **Fix**: Update the Testing section: `npm test` (Vitest, `*.test.ts` next to code), `npm run smoke`, `npm run rls-check` (needs local Supabase / CI).
- **Decision**: FIXED — AGENTS.md Testing section documents npm test, smoke and rls-check
