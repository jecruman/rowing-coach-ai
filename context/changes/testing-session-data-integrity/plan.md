# Session Data Integrity (Test Rollout Phase 1) Implementation Plan

## Overview

Add HTTP checks that prove two things from independent, hand-worked values. First, the session pages show what the rower logged and what the PRD's metric rules give. Second, a logged or edited session reads back unchanged, and a failed write is reported without saving anything. This covers Risks #1 and #2 of `context/foundation/test-plan.md`. It adds tests only; product behaviour does not change.

## Current State Analysis

- `scripts/smoke.mjs` is the only HTTP-level check. It logs one session and asserts one displayed value, the edited distance (`scripts/smoke.mjs:168-171`). It never renders a baseline, delta, label, list value, trend value or the dashboard with a session on it (research.md, "Existing coverage").
- The pages under test render on the server: session values and analysis as `dt`/`dd` pairs (`src/pages/sessions/[id].astro:108-115`, `src/components/sessions/SessionAnalysis.astro:75-85`), the list (`src/pages/sessions/index.astro`), trend rows (`src/pages/sessions/trend.astro`) and the dashboard latest session (`src/components/dashboard/DashboardView.astro:93-99`). No browser is needed.
- The edit form renders its values on the server. Inputs take `name` from `id` (`src/components/auth/FormField.tsx:48`), and a locked type is sent as a hidden `sessionType` (`src/components/sessions/SessionForm.tsx:156`).
- A redirect alone does not prove a save (research.md, Risk #2 table). Status and location must be followed by a read-back.
- `rowedOn=0000-01-01` passes app validation (verified during research) and should fail at Postgres, which has no year 0. The database half is unverified.
- Docker is not installed locally, so the HTTP checks run only in CI (`.github/workflows/ci.yml` `smoke` job: local Supabase, `astro preview` on port 4321).

## Desired End State

The CI `smoke` job runs a new `npm run integrity` step after smoke. Its checks fail if any of the following happens:
- a displayed session value, metric, delta, comparison text, label or hard note drifts from the oracle in this plan;
- the list, trend or dashboard disagrees with the oracle;
- an edit does not flow into a later session's delta;
- any field fails to read back as entered;
- an untouched edit form changes a value;
- a failed log or edit is reported as a success or leaves data behind.

Smoke keeps its current steps unchanged. Test-plan §6.2 documents the pattern.

### Key Discoveries:

- Pace = time × 500 / distance, rounded to 0.1 s; the baseline is the average of up to 3 previous same-type sessions (`src/lib/services/coaching/metrics.ts:49-60`, `:102-134`). The oracle avoids every rounding case, because the PRD does not define rounding.
- `signed()` prints U+2212 for negatives and `±0` (`src/lib/services/profile/rules.ts:46-50`). Ranges print with an en dash (`[id].astro:67`). Splits are joined with ` · ` (`[id].astro:75`).
- "Hard" means pace at or faster than goal pace + 5 s/500 m (`src/lib/services/coaching/limits.ts:72-81`). An erg goal of 2000 m in 7:30 gives a threshold of 1:57.5.
- A failed log redirects to `/sessions/new?error=Could not save your session. Please try again.` (`src/pages/api/sessions.ts:81-85`). A failed edit redirects to `/sessions/<id>/edit?error=Could not save your changes. Please try again.` (`src/pages/api/sessions/[id].ts:74-78`).
- CI has no model key, so loading a session page over HTTP never stores a suggestion. No JavaScript runs, and the markable-suggestion question never appears.

## What We're NOT Doing

- Keeping typed input after a failed save, adding a stale note to later sessions' suggestions, or rewording the per-metric baseline text (research.md Open Questions 2-4; product decisions, not tests).
- Browser or Playwright tests: hydration, client validation and the local-date sync stay outside this phase.
- Changing product code, schema or the smoke steps' behaviour.
- Checking `updated_at` after an untouched re-post. That is not visible over HTTP; the check asserts unchanged values instead.
- Expired-session submissions and suggestion content (Risk #4, test-plan Phase 3).
- Editing test-plan §3 statuses; `/10x-test-plan` owns them.

## Implementation Approach

The shared request helpers move into `scripts/lib/`, and a sibling script `scripts/session-integrity.mjs` holds the new checks. Each check group signs up its own fresh user, so seeded data never mixes. Each check reports PASS/FAIL like smoke and the script exits non-zero on any failure. Every expected value is a literal written in this plan and derived by hand from the PRD's rules, never computed by importing app code. Values are asserted per label through `dt`/`dd` pairs or per list row, never with an unbound `includes()`. Verification runs in CI on a PR branch.

## Critical Implementation Details

- **Test file placement.** Any `.ts` file under `src/pages/` becomes an Astro route, so fallback Vitest route tests (Phase 3, route B) must live outside `src/pages/`, for example `src/tests/api/`.
- **The route decision.** Phase 1's probe decides how Phase 3 checks failures. Record the outcome as a one-line note at the top of Phase 3 before starting it.

## Phase 1: Shared harness and failure-trigger probe

### Overview

Build the harness and verify the one unconfirmed fact research left: whether `rowedOn=0000-01-01` fails at the database.

### Changes Required:

#### 1. Shared request helpers

**File**: `scripts/lib/http.mjs` (new), `scripts/smoke.mjs`

**Intent**: Move the cookie jar, cookie storage and `request()` out of smoke so both scripts share one implementation. Each caller gets its own jar, so one script can drive several users.

**Contract**: `createHttpClient(baseUrl)` returns `{ request }`, with the same options and return shape as today's `request(path, { method, form, json })` → `{ status, location, body, text }`. Smoke imports it. Its steps, names and output are unchanged.

#### 2. HTML reading helpers

**File**: `scripts/lib/html.mjs` (new)

**Intent**: Zero-dependency helpers that turn a page into label-bound values, so assertions name what they check.

**Contract**:
- `definitionPairs(html)` → ordered `[label, value]` pairs from `dt`/`dd`, with tags stripped, entities decoded and whitespace collapsed.
- `formControls(html)` → `{ name: value }` for named `input`s (radios only when checked), the selected `option` of each `select`, and `textarea` content.
- A text helper strips tags and decodes entities for list, trend and dashboard rows.

#### 3. Integrity script, npm script and CI step

**File**: `scripts/session-integrity.mjs` (new), `package.json`, `.github/workflows/ci.yml`

**Intent**: A runner like smoke: a list of named checks, PASS/FAIL lines and exit code 1 on any failure. A helper signs up and signs in a fresh user (same flow as smoke), and another logs a session through `/api/sessions` and returns its path.

**Contract**:
- `"integrity": "node scripts/session-integrity.mjs"` in `package.json`, using `BASE_URL` (default `http://localhost:4321`).
- A CI step `Run session integrity checks against production preview` runs `BASE_URL=http://localhost:4321 npm run integrity` in the `smoke` job, after the smoke step and before `supabase stop`.

#### 4. Failure-trigger probe

**File**: `scripts/session-integrity.mjs`

**Intent**: Verify research Open Question 1.

**Contract**: Check `log with year 0000 is rejected by the database`. It posts an otherwise valid erg session with `rowedOn=0000-01-01` and expects a 302 whose location starts with `/sessions/new?error=` and whose decoded message is exactly `Could not save your session. Please try again.`.
- **PASS:** route A. Phase 3 uses the real database for failures.
- **FAIL with a validation message:** route B. Phase 3 uses Vitest route tests.

Either outcome is recorded at the top of Phase 3. If route B, delete the probe check.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- CI `smoke` job on the PR branch prints `All smoke steps passed` with the same step names as before
- CI runs the `npm run integrity` step and reports the probe's PASS/FAIL line

#### Manual Verification:

- The probe outcome and the chosen Phase 3 route (A or B) are recorded at the top of Phase 3

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual item before Phase 2.

---

## Phase 2: Page values match a hand-worked oracle (Risk #1)

### Overview

Seed a known history for one fresh user and assert, label by label, what the session, list, trend and dashboard pages show. Then edit one session and assert that a later session's delta follows.

### Changes Required:

#### 1. Oracle fixture and page checks

**File**: `scripts/session-integrity.mjs`

**Intent**: Prove that the session, list, trend and dashboard pages show the values the PRD's rules give, from an oracle computed by hand.

**Contract**:

- **Seed.** Save an erg goal of 2000 m in 7:30 (same form as smoke), then log these sessions in this order. Use fixed past dates, so the checks never depend on the clock.

| Key | Type | Date | Distance | Time | Other fields | Expected pace /500 m |
|---|---|---|---|---|---|---|
| E1 | erg | 2026-03-02 | 2000 | 10:00 | — | 2:30 |
| E2 | erg | 2026-03-04 | 2000 | 8:40 | — | 2:10 |
| W | water | 2026-03-05 | 8000 | 40:00 | dps `8.0-8.4`, boat `1x` | 2:30 |
| E3 | erg | 2026-03-06 | 2000 | 8:20 | — | 2:05 |
| E4 | erg | 2026-03-08 | 2000 | 8:00 | — | 2:00 |
| E5 | erg | 2026-03-10 | 2000 | 7:40 | splits `1:56 1:54 1:55 1:55`, spm `24-26`, watts `250` | 1:55 |

- **E5 page.**
  - Values: Date `2026-03-10`, Distance `2000 m`, Time `7:40`, Splits /500 m `1:56 · 1:54 · 1:55 · 1:55`, Stroke rate `24–26 spm`, Average watts `250 W`.
  - Analysis: Pace /500 m `1:55 (−10 s)`. The baseline is the average of 2:10, 2:05 and 2:00, which is 2:05; E1 and W are excluded. Split drift `−1 s` with no delta, because no baseline session has splits. Stroke rate (mid) `25 spm` with no delta.
  - Comparison text `vs your last 3 erg sessions`; labels exactly `Pace: good improvement`; the hard-session note is present (1:55 ≤ 1:57.5).
- **E1 page.** Pace `2:30` with no delta; comparison text `Comparisons start after your next erg session.`; no label; no hard note.
- **E2 page.** Pace `2:10 (−20 s)`; comparison text `vs your last 1 erg session`, the singular boundary; label `Pace: good improvement`.
- **E4 page.** No hard-session note (2:00 > 1:57.5), the boundary on the non-hard side.
- **W page.** Distance per stroke `8–8.4 m`; Pace `2:30`; comparison text `Comparisons start after your next water session.`. The earlier erg sessions do not count.
- **List** `/sessions`.
  - Six rows, newest first: E5, E4, E3, W, E2, E1.
  - The E5 row shows `2026-03-10 · Erg`, `1:55 /500 m` and `2000 m in 7:40`.
  - The W row shows `2026-03-05 · Water` and `2:30 /500 m`.
- **Trend** `/sessions/trend?metric=pace&type=erg`.
  - Rows newest first with values `1:55 /500 m`, `2:00 /500 m`, `2:05 /500 m`, `2:10 /500 m`, `2:30 /500 m`. No water row.
  - First → latest change: `−35 s /500 m`.
- **Dashboard** `/dashboard`. The latest session reads `2026-03-10 · Erg · 2000 m`.
- **Edit E4** time to `8:30`, keeping the other fields, through `/api/sessions/<id>`.
  - E4 page Pace `2:07.5`. (Implementation note: asserted as `2:07.5 (−7.5 s)`; E4's own baseline is E3 2:05, E2 2:10, E1 2:30 = 2:15, which the original literal left out.)
  - E5 page Pace `1:55 (−12.5 s)`: the baseline is the average of 2:07.5, 2:05 and 2:10, which is 2:07.5.
  - E4 list row `2:07.5 /500 m`; trend row `2:07.5 /500 m`; trend change still `−35 s /500 m`.
- **Rules for the checks.**
  - Compare each expected value with the parsed value for its label, after collapsing whitespace. The gap between a value and its parenthesised delta is not significant.
  - Treat the minus and en dash characters literally.
  - On failure, print the label, the expected value and the actual value.
  - Never compute an expected value with app code.

**Behaviour asserted**: displayed values equal hand-worked PRD values on every page that shows them, and an edit propagates.
**Regression caught**: a broken history query, ordering, window or type filter; a formatting change; pages disagreeing with each other; a stale value after an edit.
**Research source**: research.md, "Risk #1: what the page shows" and "A worked oracle".
**Edge, error and boundary cases**: no baseline (E1), a single baseline (E2), a type kept out of the baseline (W), a session excluded by the 3-session window (E1 for E5), and the hard threshold on both sides (E4, E5).
**Anti-pattern avoided**: expected values taken from the metric code, and unbound `includes()` checks.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- CI `smoke` job is green, with every Phase 2 check printing PASS in the integrity step

#### Manual Verification:

- A throwaway CI run with one expected value deliberately changed, say E5's delta `−10 s` to `−9 s`, fails and names that label. The change is then reverted.

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual item before Phase 3.

---

## Phase 3: Saves read back and failures are reported (Risk #2)

> Route from Phase 1 probe: **A (real database)**. CI run 41889715808 (commit c905a10): `log with year 0000 is rejected by the database` PASS -> `302 /sessions/new?error=Could not save your session. Please try again.` Route B (section 3) is not used.

### Overview

Prove that what the rower enters is what is stored and shown, that the edit form re-posts unchanged values, that every field can be edited, and that failed writes are reported and leave nothing behind.

### Changes Required:

#### 1. Read-back and edit checks

**File**: `scripts/session-integrity.mjs`

**Intent**: Use a second fresh user, so these checks never touch the oracle data.

**Contract**:

- **Log** water session R: rowedOn `2026-03-12`, distance `6000`, time `25:30,5` (decimal comma), splits `2:08 2:07.5 2:06`, spm `20 - 22`, dps `9,1-9.5`, boat `2x`, comment `Windy` + newline + `second line`.
- **R page** shows Date `2026-03-12`, Distance `6000 m`, Time `25:30.5`, Splits /500 m `2:08 · 2:07.5 · 2:06`, Stroke rate `20–22 spm`, Distance per stroke `9.1–9.5 m`, Boat `2x`, and the comment with both lines.
- **R edit page** form controls are `sessionType=water`, `rowedOn=2026-03-12`, `distanceM=6000`, `time=25:30.5`, `splits=2:08 2:07.5 2:06`, `spm=20-22`, `dps=9.1-9.5`, `boat=2x`, and the comment text.
- **Untouched re-post.** Post the edit form's controls, parsed from the HTML, to the form's `action`. Expect a 302 to `/sessions/<id>`, and the R page values unchanged.
- **Edit every field.** Post rowedOn `2026-03-13`, distance `6500`, time `26:00`, splits `2:00 2:01`, spm `18-20`, dps `9.6`, boat `1x`, comment empty. The R page then shows Date `2026-03-13`, Distance `6500 m`, Time `26:00`, Splits /500 m `2:00 · 2:01`, Stroke rate `18–20 spm`, Distance per stroke `9.6 m`, Boat `1x`, and no Comment section.

**Behaviour asserted**: entered values round-trip through storage, the edit form and display. The form posts the fields the endpoint reads. Every editable field updates.
**Regression caught**: a lost or mangled field, normalisation drift (comma, spaces, ranges), field-name drift between form and endpoint, and an untouched save altering data.
**Research source**: research.md, "Risk #2: saving and editing".
**Edge, error and boundary cases**: a decimal comma, a spaced range, a single-value range (`9.6`), a multi-line comment, and clearing an optional field.
**Anti-pattern avoided**: treating the redirect alone as proof of a save.

#### 2. Failure checks, route A (real database)

**File**: `scripts/session-integrity.mjs`

**Intent**: Show that a failed write is reported and leaves nothing behind, with nothing mocked.

**Contract**:
- **Failed log.** Log with rowedOn `0000-01-01`, otherwise valid. Expect a 302 to `/sessions/new?error=…`, and the followed page shows `Could not save your session. Please try again.`. `/sessions` row count for this user is unchanged.
- **Failed edit.** Edit R with rowedOn `0000-01-01`. Expect a 302 to `/sessions/<id>/edit?error=…`, and the followed page shows `Could not save your changes. Please try again.`. The R page values equal the post-edit values above.
- The Phase 1 probe check is folded into the failed-log check.

#### 3. Failure checks, route B (fallback, only if the probe failed)

**File**: `src/tests/api/sessions-write-failure.test.ts` (new; outside `src/pages/`)

**Intent**: Reach the two write-failure branches that the real database could not trigger, using a fake Supabase client for those branches only.

**Contract**:
- Mock `@/lib/supabase` `createClient` to return a fake whose `sessions` insert (log) or update (edit) resolves `{ error: { code, message } }`.
- Call the routes' `POST` with a minimal context: `locals.user`, a form-body `Request`, `params`, `redirect` and `cookies`.
- Assert the redirect location carries the exact error messages above.
- No success-path test uses the fake.

**Behaviour asserted**: a failed write tells the rower it failed, and nothing claims success.
**Regression caught**: an error swallowed into a success redirect, a wrong message, a row left after a failed log, or a change applied after a failed edit.
**Research source**: research.md, "Forcing a real write failure without a mock".
**Edge, error and boundary cases**: database rejection of a value the app accepted.
**Anti-pattern avoided**: mocking the database on success paths (route B fakes failure branches only).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- CI `smoke` job is green, with every Phase 3 check printing PASS in the integrity step
- Route B only: `npm test` passes, including the new route tests (Implementation note: not applicable, route A was used; marked done on that basis.)

#### Manual Verification:

- A throwaway CI run with one read-back expectation deliberately changed, say Time `25:30.5` to `25:30`, fails and names that label. The change is then reverted.

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual item before Phase 4.

---

## Phase 4: Cookbook and guidance

### Overview

Record the pattern so the next page or form change adds checks the same way.

### Changes Required:

#### 1. Cookbook §6.2

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 placeholder with the shipped pattern.

**Contract**: §6.2 "Proving a saved value reaches the page" lists:
- location `scripts/session-integrity.mjs`, shared helpers in `scripts/lib/`;
- a fresh user per check group, with fixed past dates;
- expected values worked out by hand from the PRD, written as literals;
- assertions bound to labels with `definitionPairs` and `formControls`;
- failure checks through `rowedOn=0000-01-01`, or the route B tests;
- run locally with `npm run integrity` against a preview with local Supabase, and in CI in the `smoke` job;
- the reference checks, by check name.

Optionally add a 2-3 line §6.6 note on the Docker-free, CI-verified loop. No other section changes.

#### 2. Agent guidance

**File**: `AGENTS.md`

**Intent**: Tell agents the integrity checks exist and when to extend them.

**Contract**: One bullet in `## Testing`: `npm run integrity` checks displayed session values against hand-worked values and save read-back over HTTP (needs a running app and local Supabase; CI runs it in the `smoke` job). Extend it when a session page, list, trend or form changes.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`

#### Manual Verification:

- Test-plan §6.2 and the AGENTS.md bullet describe the shipped script and commands accurately

---

## Testing Strategy

### Unit Tests:

- No new unit tests, except the route B fallback. The calculations are already unit-tested (`src/lib/services/coaching/metrics.test.ts`, `src/lib/services/sessions/rules.test.ts`).

### Integration Tests:

- HTTP checks in `scripts/session-integrity.mjs` against the built preview and local Supabase in CI (Phases 2-3).

### Manual Testing Steps:

1. Confirm the Phase 1 probe outcome and the recorded route.
2. Run one deliberate-break CI run per test phase and confirm the failing label is named.
3. Read §6.2 and the AGENTS.md bullet against the shipped script.

## Performance Considerations

The integrity step adds two sign-ups, about 10 writes and about 20 page reads to the `smoke` job. That should add seconds, not minutes.

## Migration Notes

Not applicable: no schema or data changes.

## References

- Research: `context/changes/testing-session-data-integrity/research.md`
- Test plan: `context/foundation/test-plan.md` (Risks #1, #2; §6.2)
- Existing harness: `scripts/smoke.mjs:13-45`, `:130-171`
- CI job: `.github/workflows/ci.yml:28-69`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared harness and failure-trigger probe

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — c905a10
- [x] 1.2 CI `smoke` job on the PR branch prints `All smoke steps passed` with the same step names as before — c905a10
- [x] 1.3 CI runs the `npm run integrity` step and reports the probe's PASS/FAIL line — c905a10

#### Manual

- [x] 1.4 The probe outcome and the chosen Phase 3 route (A or B) are recorded at the top of Phase 3 — c905a10

### Phase 2: Page values match a hand-worked oracle (Risk #1)

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 2cfa7cf
- [x] 2.2 CI `smoke` job is green, with every Phase 2 check printing PASS in the integrity step — 2cfa7cf

#### Manual

- [x] 2.3 A throwaway CI run with one expected value deliberately changed fails and names that label, then is reverted — 2cfa7cf

### Phase 3: Saves read back and failures are reported (Risk #2)

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — de2638d
- [x] 3.2 CI `smoke` job is green, with every Phase 3 check printing PASS in the integrity step — de2638d
- [x] 3.3 Route B only: `npm test` passes, including the new route tests — de2638d

#### Manual

- [x] 3.4 A throwaway CI run with one read-back expectation deliberately changed fails and names that label, then is reverted — de2638d

### Phase 4: Cookbook and guidance

#### Automated

- [x] 4.1 Lint passes: `npm run lint` — 63f6449

#### Manual

- [x] 4.2 Test-plan §6.2 and the AGENTS.md bullet describe the shipped script and commands accurately — 63f6449
