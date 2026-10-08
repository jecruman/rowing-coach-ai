---
project: Rowing Coach AI
version: 1
status: draft
created: 2026-10-06
updated: 2026-10-08
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
milestone_id: first-coached-session
milestone_seq: 1
milestone_status: open
---

# Roadmap: Rowing Coach AI

> Derived from `context/foundation/prd.md` (v1) + `shape-notes.md` Forward blocks + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First coached session loop** — Status: open

- **Intent:** A rower (the author, then the author's wife) can log real erg and water sessions, see computed metrics against their recent baseline, get one safe suggested next session, and close the loop by marking it done or skipped — so the core coaching loop is tested on real training, not demos.
- **Source materials:** `context/foundation/prd.md` (v1), plus the `## Forward: technical-roadmap` block in `context/foundation/shape-notes.md`.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-011, US-01.

## Vision recap

A masters single sculler currently gets post-session feedback from one long general-purpose AI chat, fed by hand, where history blurs and there are no reliable numbers over time. The product computes repeatable metrics against the rower's recent baseline, applies fixed safety limits, and lets a coaching judgment choose the next session on top of those numbers — then closes the loop of suggested session → done/skipped → adjusted suggestion.

## North star

**S-02: Rower logs a session and gets one safe suggested next session** — it is the shortest path to real-use feedback, because it exercises the product's core rule end to end on a real session.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — that a coaching judgment kept inside fixed safety limits, on top of computed metrics, gives a rower useful next-session advice. It is placed as early as its prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                                                 | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------ | ------------------------------------------------------------------------------------ | ------------- | ------------------------------------- | -------- |
| F-01 | coaching-model-access    | (foundation) the deployed app can make one validated coaching call to an external model | —             | Business Logic, NFR (response time)   | done |
| S-01 | rower-profile-and-goals  | sign in and set their profile plus one erg goal and one water goal                   | —             | FR-001, FR-002, FR-003                | done |
| S-02 | first-session-suggestion | log a session and get computed metrics plus one safe suggested next session           | F-01, S-01    | US-01, FR-004, FR-005, FR-007, FR-008 | done |
| S-03 | session-history          | view, edit and delete their logged sessions                                          | S-02          | FR-006                                | proposed |
| S-04 | suggestion-done-loop     | mark a suggestion done or skipped and get a next suggestion that reflects it          | S-02          | US-01, FR-009, FR-010                 | proposed |
| S-05 | metric-trend             | see how one metric changed over their sessions                                       | S-02          | FR-011                                | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme          | Chain                      | Note                                                                                   |
| ------ | -------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| A      | Coaching loop  | `F-01` → `S-02` → `S-04`   | The real-use feedback path: first suggestion, then the done/skipped loop.              |
| B      | Rower setup    | `S-01`                     | Runs in parallel with `F-01`; joins Stream A at `S-02`.                                |
| C      | Session history | `S-03`                    | Starts after `S-02`; parallel with `S-04`.                                             |
| D      | Trend view     | `S-05`                     | Nice-to-have; starts after `S-02`, parallel with `S-03` and `S-04`.                    |

## Baseline

What's already in place in the codebase as of `2026-10-06` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 + React 19 + Tailwind 4, shadcn/ui (`src/components/ui/button.tsx`), layout and auth pages.
- **Backend / API:** partial — only auth endpoints (`src/pages/api/auth/{signin,signup,signout}.ts`); no domain endpoints, no `src/lib/services/`.
- **Data:** partial — Supabase client wired (`src/lib/supabase.ts`), `supabase/config.toml` present; no migrations, no tables.
- **Auth:** present — Supabase email/password with cookie sessions, `src/middleware.ts` `PROTECTED_ROUTES`; verified on the live Worker.
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), GitHub Actions ci + smoke + deploy on `main`; verified 2026-10-06.
- **Observability:** partial — Workers observability enabled in `wrangler.jsonc`, live logs via `wrangler tail`; no error tracking or app logging library.

## Foundations

### F-01: Coaching model access

- **Outcome:** (foundation) a model API account and key exist, the key is stored as a production and CI secret and declared as a server-only secret, and the deployed app has made one coaching call whose structured answer was validated — with no product UI yet.
- **Change ID:** coaching-model-access
- **PRD refs:** Business Logic, NFR (response time)
- **Unlocks:** S-02 (the suggestion needs a working model call); reduces the unknown "does the chosen model client run on the Workers runtime?" (infrastructure.md risk register); establishes the verification path for "invalid answer → retry once → safe default".
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** creating a model-provider account and API key (user action, billing).
- **Unknowns:**
  - Which model provider and model, and the expected cost per suggestion? — Owner: user. Block: no (decide at `/10x-plan`).
- **Risk:** sequenced first because a model client that fails only at runtime on Workers would stall the north star; keep it to one validated call, not the full suggestion feature.
- **Status:** done

## Slices

### S-01: Rower profile and goals

- **Outcome:** user can sign in and set their profile (age, weight, boat) plus at most one erg goal and one water goal.
- **Change ID:** rower-profile-and-goals
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** first slice to create per-user data, so it sets the access-rule pattern every later table follows (PRD guardrail: privacy between users); getting that pattern wrong here repeats everywhere.
- **Status:** done

### S-02: First session and suggestion

- **Outcome:** user can log an erg or water session with type-specific fields and an optional comment, see its computed metrics against their recent baseline, and get one suggested next session that passes the safety limits (or the labelled safe default).
- **Change ID:** first-session-suggestion
- **PRD refs:** US-01, FR-004, FR-005, FR-007, FR-008
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - What do metrics compare against before the rower has 3 sessions of a type? (PRD Open Question 3) — Owner: user. Block: no (decide at `/10x-plan`).
  - SPM rise and pace decline thresholds (PRD Open Question 2) — Owner: user. Block: no.
  - Must the analysis always name "technique may be limiting efficiency", or is the 32 spm cap enough? (PRD Open Question 4) — Owner: user. Block: no.
- **Risk:** the north star, and the largest slice: it combines repeatable metrics, three safety limits and the model call; keep the metrics and limit checks in code and covered by tests so a model mistake can never reach the rower.
- **Status:** done

### S-03: Session history

- **Outcome:** user can view, edit and delete their logged sessions.
- **Change ID:** session-history
- **PRD refs:** FR-006
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - What happens to an existing suggestion when the session it was based on is edited or deleted? — Owner: user. Block: no.
- **Risk:** sequenced after the north star because there is nothing to manage until sessions exist; editing past sessions changes the baseline, so later suggestions must recompute rather than reuse stale numbers.
- **Status:** proposed

### S-04: Done / skipped loop

- **Outcome:** user can mark a suggested session as done or skipped, and after logging the next session gets a new suggestion that reflects it.
- **Change ID:** suggestion-done-loop
- **PRD refs:** US-01, FR-009, FR-010
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - How does a "skipped" or "done" mark change the next suggestion, concretely enough to test? (Socrates note on FR-010) — Owner: user. Block: no.
- **Risk:** completes the PRD's primary success criterion; without a testable rule for "reflects it", this slice can pass review while changing nothing for the rower.
- **Status:** proposed

### S-05: Metric trend

- **Outcome:** user can see how one metric (e.g. DPS at a given SPM, or pace per 500 m) changed over their sessions.
- **Change ID:** metric-trend
- **PRD refs:** FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Erg-only, water-only or both, given water data is noisier? (Socrates note on FR-011) — Owner: user. Block: no.
- **Risk:** nice-to-have (PRD secondary success criterion); sequenced last so it never delays the coaching loop, and it needs several logged sessions before it shows anything.
- **Status:** proposed

## Backlog Handoff

Mirrored in Linear: project [Rowing Coach AI](https://linear.app/jesusproject/project/rowing-coach-ai-5dc65908f574), milestone "M-1: First coached session loop" (team Jesusproject). This file stays the source of truth; Linear statuses are synced by hand.

| Roadmap ID | Change ID                | Suggested issue title                                         | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------ | ------------------------------------------------------------- | --------------------- | ----- |
| F-01       | coaching-model-access    | Set up model API access and one validated coaching call       | yes                   | Linear JES-11. Needs a model-provider account and key first |
| S-01       | rower-profile-and-goals  | Rower can set profile and erg/water goals                     | yes                   | Linear JES-12. Run `/10x-plan rower-profile-and-goals` |
| S-02       | first-session-suggestion | Rower logs a session and gets a safe suggested next session   | no                    | Linear JES-13. After F-01 and S-01 |
| S-03       | session-history          | Rower can view, edit and delete sessions                      | no                    | Linear JES-14. After S-02 |
| S-04       | suggestion-done-loop     | Rower marks suggestion done/skipped; next suggestion adapts   | no                    | Linear JES-15. After S-02 |
| S-05       | metric-trend             | Rower sees one metric's trend over time                       | no                    | Linear JES-16. After S-02; nice-to-have |

## Open Roadmap Questions

1. **Open sign-up vs. AI usage cost** — open registration lets strangers trigger generated recommendations; is any limit needed? — Owner: user. Block: S-02 (decide before the app is shared beyond the family). S-02 status: guarded by the `COACH_EMAILS` allowlist + an Anthropic workspace spend limit. Known risk accepted for the family MVP (S-02 impl review F2): two simultaneous suggestion requests for one session each run the full agent (up to 8 model calls each) because nothing claims the session first — add a claim/pending state before sharing beyond the family.
2. **Remaining thresholds** — SPM rise threshold, pace decline threshold. — Owner: user. Block: S-02 (non-blocking; decide at planning).
3. **Baseline with fewer than 3 sessions** — what the metrics compare against before the rower has 3 sessions of a type. — Owner: user. Block: S-02 (non-blocking; decide at planning).
4. **Named technique verdict** — when pace improves while DPS clearly drops and SPM rises, must the analysis always state "technique may be limiting efficiency", or is the 32 spm rate cap enough? — Owner: user. Block: S-02 (non-blocking).
5. **Analysis response target** — exact seconds for "within a few seconds". — Owner: user. Block: S-02 (non-blocking).
6. **Absolute vs. per-rower thresholds** — MVP thresholds (DPS +0.5 / −0.3 m, pace −5 s) are absolute; at larger scale they would be relative to each rower's own baseline. Decide which applies in MVP. — Owner: user. Block: S-02 (non-blocking).
7. **Non-goals not selected** — multi-week/race-date plans, calendar export & motivational charts, and medical/HR-based advice were offered as non-goals but not selected; confirm whether these should be listed as explicit non-goals. — Owner: user. Block: roadmap-wide (non-blocking).
8. **Model provider and cost per suggestion** — which provider/model makes the coaching judgment, and what one suggestion costs; ties into question 1. — Owner: user. Block: F-01 (non-blocking; decide at planning).

## Parked

- **Imports and integrations** (rowing-app files, devices, screenshots) — Why parked: PRD §Non-Goals; manual typing only in MVP, first import planned right after.
- **Video analysis of technique** — Why parked: PRD §Non-Goals; technique tips come from numbers only.
- **Coach view and sharing** — Why parked: PRD §Non-Goals; each rower sees strictly their own data.
- **Offline use** — Why parked: PRD §Non-Goals.
- **Multi-week plan to the goal date** — Why parked: PRD §Business Logic sets the MVP planning horizon to the next session only.

## Milestone History

## Done

- **F-01: (foundation) a model API account and key exist, the key is stored as a production and CI secret and declared as a server-only secret, and the deployed app has made one coaching call whose structured answer was validated — with no product UI yet.** — Archived 2026-10-06 → `context/archive/2026-10-07-coaching-model-access/`. Lesson: —.
- **S-01: user can sign in and set their profile (age, weight, boat) plus at most one erg goal and one water goal.** — Archived 2026-10-08 → `context/archive/2026-10-08-rower-profile-and-goals/`. Lesson: [Ship the schema before the code that needs it](lessons.md).
- **S-02: user can log an erg or water session with type-specific fields and an optional comment, see its computed metrics against their recent baseline, and get one suggested next session that passes the safety limits (or the labelled safe default).** — Archived 2026-10-08 → `context/archive/2026-10-08-first-session-suggestion/`. Lesson: —.
