---
date: 2026-11-02T18:09:53+01:00
researcher: Claude
git_commit: f1b1b70f17490de3d9ebb05bf94e9ecc42c735a2
branch: ui-landing-page-review-fixes
repository: rowing-coach-ai
topic: "Ground rollout Phase 1 (Session data integrity): Risks #1 and #2"
tags: [research, testing, sessions, smoke, rollout-phase-1]
status: complete
last_updated: 2026-11-02
last_updated_by: Claude
---

# Research: Ground rollout Phase 1 (Session data integrity): Risks #1 and #2

**Date**: 2026-11-02T18:09:53+01:00
**Researcher**: Claude
**Git Commit**: f1b1b70f17490de3d9ebb05bf94e9ecc42c735a2 (no `src`, `scripts` or `supabase` changes since 2af78f9, where reading began)
**Branch**: ui-landing-page-review-fixes
**Repository**: rowing-coach-ai

## Research Question

Ground the real failure paths for Risk #1 (pages show numbers that disagree with what was logged or computed, including stale values after an edit) and Risk #2 (saving or editing a session fails or loses data, or the rower is told the wrong outcome). Verify or correct the response guidance, locate existing tests, identify the cheapest useful layer, and flag speculative risks or misleading hot-spot evidence.

## Summary

Both risks are real, but they are narrower than the plan words them, and no browser is needed for the numbers.

- **The numbers gap is confirmed.** Unit tests cover the calculations. The HTTP smoke test logs one session and asserts just one displayed value, the edited distance (`scripts/smoke.mjs:168-171`). With one session it never renders a baseline, a delta or a label.
- **No browser is needed for Phase 1's numbers.** The session values, analysis, list, dashboard and trend values are server-rendered in Astro templates without a client directive (`src/pages/sessions/[id].astro:109-131`). Assertions on HTTP responses, in the existing zero-dependency smoke harness, can see them.
- **A failed write can probably be tested without a mock.** `rowedOn=0000-01-01` passes the app's validation (run during this research), and Postgres should reject it at write time. The Postgres half was not run, because no local database container was running.
- **Failed saves discard what the rower typed.** This behaviour is not a test gap but a likely defect: the redirect after a failed insert renders an empty form (`src/pages/api/sessions.ts:84`, `src/pages/sessions/new.astro:35`). It is a product decision for the plan.
- **"Stale values after an edit" is mostly speculative.** Computed values are recalculated on each render. The remaining stale case is a later session's stored suggestion, which shows no note after an earlier session is edited.
- **The dashboard shows no computed metric.** It shows a latest-session date, type and distance, goal targets and profile facts, so "dashboard numbers" is a small check. The trend page, not named in the plan, shows computed numbers.

## Detailed Findings

### Risk #1: what the page shows

**Render path.** `src/pages/sessions/[id].astro` reads the session and up to 30 rows of history (`:27`, `:50`), computes the analysis at render time (`:62`) and passes it to `SessionAnalysis.astro`, which formats each row (`src/components/sessions/SessionAnalysis.astro:25-58`).

**Existing coverage on this inspected path:**

| Displayed value | Unit test on the calculation | Asserted over HTTP |
|---|---|---|
| Edited distance on the session page | n/a | Yes (`scripts/smoke.mjs:168-171`) |
| Time, splits, stroke rate, watts on the session page | Format and round trip only (`src/lib/services/sessions/rules.test.ts`) | No: `:151` asserts status 200 |
| Pace, drift, midpoints, deltas, labels | Yes (`src/lib/services/coaching/metrics.test.ts`) | No |
| Comparison text ("vs your last 3 ...") | No inspected test of the text | No |
| Hard-session note | Yes for the rule (`src/lib/services/coaching/limits.test.ts`) | No |
| List row date, pace, distance, time | No | No: `:155` checks the link only |
| Dashboard latest session | No | No: `:103` runs before any session exists and asserts status 200 only |
| Trend values and change | Yes (`src/lib/services/sessions/trend.test.ts`) | No: `:182-190` checks the picker and absence of a load error |

**A failed history read is covered only indirectly.** The page degrades to "no comparison" and still returns 200 (`[id].astro:62`, `SessionAnalysis.astro:60-61`), so the session-page step would pass. The suggestion step would fail, because the endpoint returns 500 when that read fails (`src/pages/api/sessions/[id]/suggestion.ts:87`) and smoke expects 200 (`scripts/smoke.mjs:192-195`). That catches an erroring query, not one that returns the wrong rows.

**Checked and not a defect:**
- The list formats raw pace (`src/pages/sessions/index.astro:30`) while the analysis formats pace already rounded to 0.1 (`src/lib/services/coaching/metrics.ts:54`). `formatTime` rounds to tenths (`src/lib/services/profile/rules.ts:34`), so both should display the same text. They reach it through different calls, which justifies one cross-page assertion.
- The page and the suggestion endpoint use the same 30-row window (`[id].astro:27`, `suggestion.ts:21`), so they see the same baseline.

**Possible incongruences a page test would expose:**
1. **"Last N" label versus per-metric baseline.** The label counts baseline sessions (`SessionAnalysis.astro:64`, `metrics.ts:133`), but each metric averages only the sessions that have it (`metrics.ts:109-110`). With three erg sessions, one of which logged stroke rate, the stroke-rate delta comes from one session under the text "vs your last 3 erg sessions".
2. **History window of 30 rows of any type.** The window is not filtered by type (`src/lib/services/sessions/load.ts:187-193`). After more than 30 consecutive water sessions, a new erg session has no baseline and reads "Comparisons start after your next erg session" (`SessionAnalysis.astro:63`), although earlier erg sessions exist. This needs a season without erg, so it is uncommon. The S-02 review recorded the window as beneficial drift (F7) without covering this message.

### Risk #1: "stale values after an edit"

- **Computed values are not stale on the inspected path.** They are derived on each render from the current row (`[id].astro:62`), and `load.ts:18-19` reads all columns each time.
- **The edited session's own suggestion is handled.** It is kept as a snapshot and labelled "Suggested before you edited this session" (`src/components/sessions/SuggestionPanel.tsx:158-162`), using a unit-tested comparison (`src/lib/services/sessions/staleness.ts`). The label's rendered path has no HTTP assertion.
- **A later session's suggestion is not labelled.** The check compares a session with its own stored suggestion (`[id].astro:56-59`). Editing session A changes the baseline shown on later session B, while B's stored suggestion, built from the old baseline, shows no note. The rower can then read a "Why" text that disagrees with the analysis above it. The S-03 brief chose snapshots for the edited session (`context/archive/2026-10-11-session-history/plan-brief.md:21`), and the inspected brief does not address later sessions. This matches the interview's "incongruent data" concern and needs a decision.

### Risk #2: saving and editing

**Save path (`src/pages/api/sessions.ts`):** parse form (`:28-34`), validate (`:38-45`), mark check (`:58-73`), insert returning the id (`:75-79`), error redirect (`:81-85`), mark insert (`:87-105`), redirect to the new session (`:107`).

**Edit path (`src/pages/api/sessions/[id].ts`):** load the current row (`:44-51`), parse and validate (`:53-66`), update only when a value changed (`:68-83`), redirect to the session (`:85`).

**Challenge verdict: "a redirect means the row was saved".** Partly wrong as stated, and the redirect target matters:

| Redirect | Meaning |
|---|---|
| `/sessions/<id>` after a log | Insert returned no error; the id comes from the inserted row (`sessions.ts:75-85`, `:107`) |
| `/sessions/<id>?error=` after a log | Session saved, done/skipped answer not saved (`sessions.ts:94-103`) |
| `/sessions/<id>` after an edit | Update succeeded, or nothing changed and no write ran (`[id].ts:68`, `:85`) |
| `/sessions` after an edit | Session gone or not visible, or an invalid id; no message is shown and the edits are dropped (`[id].ts:35-37`, `:49-51`, `:80-82`) |
| `/sessions/new?error=` or `/edit?error=` | Rejected or failed (`sessions.ts:17-19`, `[id].ts:19-21`) |
| `/auth/signin` | No user on the request; no message, and the submission is dropped (`sessions.ts:24-26`, `[id].ts:29-32`) |

Status and location therefore cannot prove a save. A useful test reads the values back.

**Round trip coverage.** Unit tests cover form values to row values and back (`src/lib/services/sessions/rules.test.ts`). Smoke re-posts a changed distance (`scripts/smoke.mjs:159-171`). Nothing over HTTP proves that the other fields read back identically, or that an untouched edit form changes nothing. The edit form is rendered on the server with its values (`src/pages/sessions/[id]/edit.astro:55-61`, `client:load`), and fields take their `name` from their `id` (`src/components/auth/FormField.tsx:48`), so a test can read the form from the HTML and re-post it. Smoke posts its own field names to the API (`scripts/smoke.mjs:48-57`, `:133-136`), so today a renamed form field would not fail it.

**Failure messages and lost input:**
- **Log failure.** The rower sees "Could not save your session" on an empty form, because `new.astro:35` passes no initial values and `sessions.ts:18` carries only the message. Everything typed is lost. Client validation uses the same schema first (`src/components/sessions/SessionForm.tsx:110-124`), so this applies mainly to server-side failures.
- **Edit failure.** The form reloads stored values (`edit.astro:57`), so the attempted edits are lost.
- **Expired sign-in or a failed auth read.** Middleware treats no returned user as signed out (`src/middleware.ts:10-13`), and the endpoints redirect to sign-in with no notice. The rower's submission is lost.

**Forcing a real write failure without a mock.** The schema mirrors the column checks closely, so ordinary bad values are rejected before the database (`src/lib/services/sessions/rules.ts:97-154`, `supabase/migrations/20261008200000_create_sessions_and_suggestions.sql:11-39`). The inspected exception is `rowed_on`:
- `z.iso.date()` accepted `0000-01-01` in a run during this research, and `RowedOnSchema` adds only an upper bound (`rules.ts:92-95`).
- Postgres has no year 0, so the `date` column should reject the value and PostgREST should return an error. **This was not run**, because no local database container was running.

If confirmed, the log and edit failure branches can be exercised against the real database. Note that this is also a small validation gap. If a later change tightens the date rule, the test fails because the message changes, which prompts choosing a new trigger.

### Layer and test placement

- **Recommended layer: HTTP assertions** against the built preview and local Supabase. The CI `smoke` job already runs this setup (`.github/workflows/ci.yml:28-69`), and the harness has no dependencies.
- **Bind each value to its label.** `includes("2100 m")` (`scripts/smoke.mjs:170`) cannot tell which row matched, and more seeded sessions make such checks weaker. Parse `dt` and `dd` pairs instead, since the values use that structure (`[id].astro:108-115`, `SessionAnalysis.astro:75-85`).
- **Expect special characters.** `signed()` uses U+2212 for minus and `±0` (`rules.ts:46-50`). Splits join with ` · ` (`[id].astro:75`).
- **Vitest route tests are a fallback.** No inspected test imports a route or uses `vi.mock` for one. `src/lib/supabase.ts` imports `astro:env/server`, which the Vitest config supports (`vitest.config.ts:4-9`). Use a fake client only for a failure branch that cannot be reached against the real database. Do not use one for a successful write.
- **Browser residual.** Client-side behaviour the HTTP layer cannot see: hydration, client validation blocking a valid submit, and the local-date sync (`SessionForm.tsx:103-107`, `:145-149`). The suggestion panel also fetches on the client, but it belongs to Risk #4. Project guidance places E2E in a later lesson, so these stay outside Phase 1.

### Response guidance corrections

| Risk | Plan guidance | Verdict | Correction |
|---|---|---|---|
| #1 | Assert hand-worked values on the page | Supported | Choose values that avoid rounding, since the PRD does not define rounding; bind values to labels; add the trend page and a cross-page pace check |
| #1 | "Dashboard numbers" | Partly misleading | The dashboard has no computed metric; a small date, type and distance check is enough |
| #1 | "Stale values after an edit" | Partly speculative | Keep the edit-updates-the-page proof and the edited-session note; the later-session case is a decision, not a test |
| #2 | Read back after save | Supported | Include every field, and re-post the form from the HTML to catch field-name drift |
| #2 | Failed write shows an error and no success | Supported, incomplete | Assert the absence of a row too; lost input is a separate decision |
| #2 | Avoid mocking the database write | Supported for success paths | A real failure trigger is likely available; a fake client stays a fallback for unreachable failure branches |

### A worked oracle

These inputs give values checkable by hand from the PRD's definitions (`context/foundation/prd.md:116`): average of the last 3 same-type sessions, pace per 500 m. They are chosen so no rounding occurs.

| Date order | Erg session | Pace /500 m |
|---|---|---|
| 1 (oldest, must be excluded) | 2000 m in 10:00 | 2:30 |
| 2 | 2000 m in 8:40 | 2:10 |
| 3 | 2000 m in 8:20 | 2:05 |
| 4 | 2000 m in 8:00 | 2:00 |
| 5 (under test) | 2000 m in 7:40 | 1:55 |

For session 5, the baseline is the average of 2:10, 2:05 and 2:00, which is 2:05. The page should show pace 1:55, delta −10 s, "vs your last 3 erg sessions" and "Pace: good improvement" (at least 5 s faster, per the PRD). Including session 1 would give a different delta, so this also proves the window. With an erg goal of 2000 m in 7:30, the hard threshold is 1:57.5, so the hard-session note should appear (`src/lib/services/coaching/limits.ts:72-81`). Fixed past dates avoid clock dependence, unlike the smoke session's current date (`scripts/smoke.mjs:50`).

## Code References

- `scripts/smoke.mjs:103,151,155,168-171,182-190,192-195` - What smoke asserts today
- `src/pages/sessions/[id].astro:27,50,56-59,62,75,108-131` - Session page data and rendering
- `src/components/sessions/SessionAnalysis.astro:25-64` - Analysis rows and comparison text
- `src/lib/services/coaching/metrics.ts:54,91,102-134` - Metrics and baseline
- `src/lib/services/profile/rules.ts:34,46-55` - Time, signed value and pace helpers
- `src/lib/services/sessions/load.ts:180-199` - History read
- `src/pages/api/sessions.ts:17-19,75-107` - Log endpoint
- `src/pages/api/sessions/[id].ts:29-37,49-51,68-85` - Edit endpoint
- `src/pages/sessions/new.astro:35`, `src/pages/sessions/[id]/edit.astro:55-61` - Forms after a failure
- `src/lib/services/sessions/rules.ts:92-95` - Date validation
- `src/components/dashboard/DashboardView.astro:93-99` - Dashboard latest session
- `src/middleware.ts:10-22` - Treats no returned user as signed out

## Architecture Insights

- Pages post real HTML forms and endpoints answer with 302 redirects carrying `?error=`, so outcomes must be read from the location and the next page.
- Pages degrade rather than fail on secondary reads and still return 200, so a status-only assertion can pass on a broken section.
- Suggestions are stored snapshots while analysis is derived, so the two can legitimately disagree after an edit.

## Historical Context (from prior changes)

- `context/archive/2026-10-13-metric-trend/reviews/impl-review-round1.md` F1 - A status-only smoke step passed on a failed trend read; supported as the same weakness now seen at `scripts/smoke.mjs:103` and `:151`.
- `context/archive/2026-10-11-session-history/plan-brief.md:21-22` - Snapshot suggestions and no-op saves were deliberate; the no-op rule is why an untouched re-post should not move `updated_at`.
- `context/archive/2026-10-11-session-history/reviews/impl-review.md` F7 - Paging, the edited note and suggestion-after-delete relied on a general user confirmation plus smoke.
- `context/archive/2026-10-11-suggestion-done-loop/reviews/impl-review.md` F2 - The silent mark drop is fixed; supported by `src/pages/api/sessions.ts:61-63` and `:94-103`.

## Related Research

`context/archive/2026-10-08-first-session-suggestion/research.md` and `context/archive/2026-10-13-ui-rowing-theme-dashboard/research.md` exist but were not read; they cover other questions.

## Open Questions

1. **Verify first:** does writing `rowed_on = 0000-01-01` fail through PostgREST with a local database, and which message does the rower see? Owner: first plan phase. If not, use the Vitest fallback.
2. **Decision:** should a failed log or edit keep what the rower typed? This is a code change beyond tests. Owner: user.
3. **Decision:** should a later session's stored suggestion show a note after an earlier session is edited? Owner: user.
4. **Decision:** should the comparison text reflect per-metric baseline counts, and should the history window guarantee a same-type baseline? Owner: user.
5. **Scope note:** Risk #1 needs the trend page added and the dashboard wording reduced in the test plan. `/10x-test-plan` owns that backport.
