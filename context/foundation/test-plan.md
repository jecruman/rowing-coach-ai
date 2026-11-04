# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-02

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `scripts`,
`supabase/migrations`, excluding generated database types, docs, `context/`
and build output. Churn figures are file changes over 2026-10-05 to
2026-10-31 (21 commits). That window is the repo's whole history, so churn
partly reflects first-time building.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Session or dashboard pages show numbers that disagree with what was logged or computed, including stale values after an edit | High | High | Interview Q1, Q4; PRD Guardrails; hot-spot dirs `src/pages/sessions` (16 file changes/30d), `src/pages` (13); archive: session-history and metric-trend reviews |
| 2 | Saving or editing a session fails or loses data, or the rower is told the wrong outcome | High | High | Interview Q1; PRD FR-004, FR-006; hot-spot dir `src/pages/api` (21); archive: rower-profile and suggestion-done-loop reviews |
| 3 | The deployed Worker breaks a core flow that passed locally, because of a runtime, secret or schema difference | High | High | Interview Q2; roadmap F-01 risk; lessons.md "Ship the schema before the code that needs it" |
| 4 | A prompt or schema change, or hostile rower text, gets a limit-breaking suggestion shown or silently degrades coaching to the default | High | High | Interview Q3; PRD Guardrails and Business Logic; hot-spot dir `src/lib/services` (67); lessons.md "User text sent to the model must be validated and fenced"; archive: first-session-suggestion and suggestion-done-loop reviews |
| 5 | A signed-in rower reads or changes another rower's data through a page or endpoint | High | Medium | PRD Guardrails and Access Control; AGENTS.md hard rules; archive: rower-profile and session-history reviews |
| 6 | Marking a suggestion done or skipped changes nothing, or a skip's cap is silently dropped from the next suggestion | Medium | Medium | PRD FR-009, FR-010; roadmap S-04 risk; archive: suggestion-done-loop review |
| 7 | A stranger or repeated requests trigger paid model calls | Medium | Low | PRD Open Question 1; roadmap Open Question 1 (accepted for the family MVP; re-rate before sharing beyond the family); archive: first-session-suggestion review |

Not tested, by evidence: a model-provider outage is high impact but low
likelihood, so it belongs to alerting (the labelled default is covered under
Risk #4). The response-time target is undefined (PRD Open Question 5), so
there is nothing to assert yet. Secret and PII leakage has one archived log
finding, below the top 7; Phase 4 research rechecks it.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A known session shows hand-worked values on the page, and an edit updates them | Correct unit-tested metrics mean a correct page | Data path from database to rendered value; server or client rendering | HTTP assertions on rendered pages; browser only for client-rendered values | Expected values produced by the metric code itself |
| #2 | A saved or edited session reads back identical; a failed write shows an error and no success message | A redirect means the row was saved | Validation, write path, failure translation | Integration against local Supabase | Mocking the database write |
| #3 | The deployed app completes sign-in and a core read; a missing secret or table fails loudly | Green CI means production works | How CI's preview differs from production; secret and migration paths | Post-deploy smoke | Checking only that the home page returns 200 |
| #4 | Realistic model outputs are rejected or accepted correctly through the full pipeline; the default is labelled; rower text stays data | Fake-model tests mean real answers still parse | Retry path, schema boundary, fencing, source of recorded outputs | Contract tests on recorded outputs; a small live check only if they miss drift | Asserting exact wording or prompt text |
| #5 | Rower B gets no data and changes nothing on rower A's resources through each route | Database RLS checks mean every route behaves correctly | Route inventory; response for foreign and missing IDs | Extend the two-user HTTP checks | Testing only the signed-out case |
| #6 | The same history with done versus skipped produces a verifiably different input or cap | The mark was stored, so it was used | Concrete rule for "reflects it"; read-failure behaviour | Integration with a fake model | Asserting only the stored status |
| #7 | A non-allowlisted user triggers zero model calls at the endpoint | The allowlist unit test means the endpoint is gated | Gate order; regeneration and concurrency paths | Endpoint integration with a fake model | Calling a real model in the test |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Session data integrity | Prove what the rower saves is stored and shown correctly | #1, #2 | integration, HTTP page assertions | change opened | testing-session-data-integrity |
| 2 | Deployed runtime confidence | Prove the deployed Worker runs the core flow and fails loudly on a missing secret or table | #3 | post-deploy smoke, config checks | not started | — |
| 3 | Coaching change safety | Prove model and schema changes cannot reach the rower unsafely, and that marks take effect | #4, #6 | contract, integration | not started | — |
| 4 | Access and abuse boundaries | Prove route-level isolation between rowers and the paid-call gate | #5, #7 | two-user HTTP, integration | not started | — |
| 5 | Quality gates and agent hooks | Lock the floor at edit, end of turn and CI | cross-cutting | hooks, gates | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

Test-base profile: `sparse` — Vitest configured, 10 test files (139 cases),
all under `src/lib/services/`; HTTP and cross-user checks exist as scripts.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | 4.1.11 | Runs through Astro's Vite config; fakes external clients |
| integration (HTTP) | `npm run smoke` | n/a | Auth, profile and goal flows over HTTP; extended per phase |
| cross-user access | `npm run rls-check` | n/a | Access rules on a real local database |
| API mocking | none yet | n/a | MSW not installed; see Phase 3 if a fake client is not enough |
| e2e | none yet | n/a | Playwright not installed; Phase 1 research decides whether a browser is needed |
| accessibility | none yet | n/a | No rollout phase; not in the top risks |

**Stack grounding tools (current session):**
- Docs: Context7 — resolved Vitest and Playwright library IDs; no API detail needed at plan level; checked: 2026-11-02
- Search: Exa — available, not used; local manifests were sufficient; checked: 2026-11-02
- Runtime/browser: T3 preview tools — available, not used; possible manual verification only; checked: 2026-11-02
- Provider/platform: Linear — available, not a quality gate; Cloudflare, Supabase and GitHub MCPs not available in current session; checked: 2026-11-02

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint on staged files | pre-commit | required (wired) | syntactic drift before commit |
| lint + UI literal scan | CI | required (wired) | syntactic drift, literal colours in migrated views |
| typecheck (`astro check`) | CI | required (wired) | type drift |
| unit tests | CI | required (wired) | logic regressions in services |
| build | CI | required (wired) | build-breaking changes |
| cross-user access check | CI | required (wired) | database access-rule regressions |
| database types match migrations | CI | required (wired) | schema and generated types drifting apart |
| smoke over HTTP | CI on local preview | required (wired) | broken auth, profile and goal flows |
| session save and page-value checks | CI | required after §3 Phase 1 | lost saves, wrong numbers on pages |
| post-deploy smoke | after deploy | required after §3 Phase 2 | runtime, secret and schema differences in production |
| coaching contract tests | CI | required after §3 Phase 3 | model or schema changes that break validation or limits |
| two-user route checks | CI | required after §3 Phase 4 | cross-user access through pages and endpoints |
| per-edit lint of the edited file | local (agent loop) | recommended after §3 Phase 5 | lint errors while the agent works |
| end-of-turn typecheck + tests for changed files | local (agent loop) | recommended after §3 Phase 5 | type and test failures before the agent hands back |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location**: `*.test.ts` next to the code under test.
- **Mocking policy**: fake external clients; no real model or network calls.
- **Reference test**: `src/lib/services/coaching/limits.test.ts`.
- **Run locally**: `npm test`.

### 6.2 Proving a saved value reaches the page

- TBD — see §3 Phase 1 for the save read-back and hand-worked page-value pattern.

### 6.3 Checking the deployed Worker

- TBD — see §3 Phase 2 for the post-deploy core-flow and missing-secret pattern.

### 6.4 Testing a coaching prompt or schema change

- TBD — see §3 Phase 3 for the recorded-output contract and done/skipped input pattern.

### 6.5 Testing a new route for cross-user access

- TBD — see §3 Phase 4 for the two-user route and paid-call gate pattern.

### 6.6 Per-rollout-phase notes

(After each phase lands, `/10x-implement` appends a 2-3 line note here
capturing anything surprising the phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Pixel-perfect visual tests of the landing page** — it is marketing and
  snapshots would break constantly. Re-evaluate if the landing page starts
  carrying product data or sign-in logic. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-02
- Stack versions last verified: 2026-11-02
- AI-native tool references last verified: 2026-11-02

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
