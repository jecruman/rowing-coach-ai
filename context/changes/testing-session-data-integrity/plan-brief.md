# Session Data Integrity (Test Rollout Phase 1) — Plan Brief

> Full plan: `context/changes/testing-session-data-integrity/plan.md`
> Research: `context/changes/testing-session-data-integrity/research.md`

## What & Why

Prove, from independently worked-out values, that the session pages show what the rower logged and what the PRD's metric rules give. Also prove that saves read back unchanged and failed writes are reported without saving anything. This covers the test plan's top two risks, "pages show incongruent numbers" and "saving a session doesn't work", which came from the interview.

## Starting Point

Unit tests cover the calculations. The HTTP smoke test logs one session and checks just one displayed value, so baselines, deltas, labels, the list, trend and dashboard values, and failed saves go unchecked. Docker is not installed locally, so database-backed checks run only in CI.

## Desired End State

A new `npm run integrity` step in the CI `smoke` job fails when any of these happens:
- a displayed value drifts from a hand-worked oracle;
- the pages disagree with each other;
- an edit fails to flow into a later session's delta;
- a field fails to read back as entered;
- an untouched edit form changes data;
- a failed write is reported as a success or leaves data behind.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test layer | HTTP checks against the built preview and local Supabase | Every value under test is server-rendered, so a browser adds cost without signal | Research |
| Oracle | Hand-worked literals from PRD rules, avoiding rounding | Expected values must not come from the code under test | Research |
| Assertion style | Values bound to labels (`dt`/`dd`, form controls, rows) | An unbound `includes()` cannot tell which value matched | Research |
| Failed-write trigger | `rowedOn=0000-01-01` against the real database; Vitest route tests with a fake client only if the probe fails | Keeps success paths unmocked | Research |
| Verification environment | CI on a PR branch | No Docker locally; CI is the environment that gates merges | Plan |
| Harness | Sibling `session-integrity.mjs` with shared helpers in `scripts/lib/` | Keeps smoke a fast path check without duplicating cookie handling | Plan |
| Product decisions | Out of scope: keeping typed input after a failed save, later-session stale note, baseline wording | Test-only phase; these need user decisions | Research |

## Scope

**In scope:**
- shared request and HTML helpers;
- the integrity script, npm script and CI step;
- the failure-trigger probe;
- oracle checks on the session, list, trend and dashboard pages, plus downstream propagation after an edit;
- field read-back, untouched re-post and edit of every field;
- failed log and edit checks;
- test-plan §6.2 and the AGENTS.md Testing bullet.

**Out of scope:** product code changes, browser tests, `updated_at` inspection, expired sessions, suggestion content, and test-plan §3 statuses.

## Architecture / Approach

`scripts/lib/http.mjs` gives each user its own cookie jar and `request()`, and smoke imports it unchanged. `scripts/lib/html.mjs` turns pages into label/value pairs and form controls. `scripts/session-integrity.mjs` runs named PASS/FAIL checks, each group with a fresh user and fixed past dates. CI runs it after smoke in the `smoke` job.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Shared harness and failure-trigger probe | Helpers, script, CI step; Phase 3 route decided | Refactoring smoke changes its behaviour |
| 2. Page values match a hand-worked oracle | 6-session oracle checked on 4 pages, plus edit propagation | Formatting characters (U+2212, en dash) mismatched |
| 3. Saves read back and failures are reported | Read-back, re-post, edit every field, failed writes | Year 0000 not rejected at the database (fallback planned) |
| 4. Cookbook and guidance | §6.2 pattern and AGENTS.md bullet | — |

**Prerequisites:** a PR branch with CI access; no local Docker needed.
**Estimated effort:** ~2-3 sessions across 4 phases, each verified with a CI run of a few minutes.

## Open Risks & Assumptions

- The year-0000 trigger is unverified until the Phase 1 probe runs; route B covers the alternative.
- Each check-fix loop waits on CI.
- The HTML parsing is regex-based. Exact expected values make a parser bug fail loudly rather than pass silently, and deliberate-break runs confirm it.

## Success Criteria (Summary)

- The integrity step fails on a changed oracle value or read-back value, and names the label (shown by the deliberate-break runs).
- CI passes with smoke unchanged and all integrity checks green.
- The next agent adding a page or form check finds the pattern in test-plan §6.2.
