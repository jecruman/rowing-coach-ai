# First Session Suggestion — Plan Brief

> Full plan: `context/changes/first-session-suggestion/plan.md`
> Research: `context/changes/first-session-suggestion/research.md`

## What & Why

Roadmap S-02 (north star, JES-13): a rower logs an erg or water session, sees its metrics against their recent baseline, and gets one suggested next session that passes the three PRD safety limits — or the labelled safe default. This is the first time the app does what it exists for: replace the hand-fed chat thread with repeatable numbers and a safe, explained next session.

## Starting Point

F-01 left a tested single-call coaching service (retry once, safe default, fenced user text) whose output cannot yet be checked against volume or hard/easy limits. S-01 left the per-user table pattern (RLS, generated types, rls-check, smoke) plus profile and goals. There are no sessions, metrics or limit checks yet; a temporary allowlisted try-it endpoint exists.

## Desired End State

On a phone, the rower fills `/sessions/new`, lands on `/sessions/<id>` and instantly sees pace, split drift, SPM and DPS against "your last N" sessions with labels such as "clear drop". A "Coach is thinking…" panel then shows one suggestion (structure, rate cap, pace, focus, reason, technique tip) that code has verified against the limits, or a clearly labelled safe default. Reloading shows the stored suggestion. Only allowlisted rowers trigger model calls.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Baseline before 3 sessions | Compare with up to 3 previous same-type sessions, labelled "vs your last N"; first session shows values only | Every session gets an analysis without pretending a weak baseline is strong | Plan |
| Volume limit (1) | Total distance and total time (incl. rest) each ≤ 110 % of the average of up to 3 latest same-type sessions incl. the new one | Closes both loopholes; first session already gets a cap | Plan |
| Easy (limit 3) | Max rate ≤ 22 spm and no pace target at/faster than goal pace + 5 s | Checkable, consistent with the safe default | Plan |
| Hard rule | Last 2 sessions of any type; no goal for that type = not hard | Recovery is about the body; deterministic with partial data | Plan |
| Metrics | Pace from time ÷ distance; drift = last − first split; SPM/DPS by range midpoint | Works with distance + time only (US-01) | Plan |
| Labels | Only PRD thresholds + "technique may be limiting efficiency" (pace better, DPS clear drop) | Deterministic, no invented numbers | Plan |
| Suggestion format | Readable text + required numbers (total distance, total minutes, max spm, fastest pace) | Every limit becomes checkable with a small schema change | Plan |
| Coaching call | Small agent: 3 read-only in-memory tools, ≤ 4 turns per attempt; code saves and validates | Meets the agent learning goal while guarantees stay in code | Plan |
| Flow | Save → instant analysis page → island fetches and stores suggestion | Session never lost; progress visible during the 15–25 s wait | Plan |
| Cost guard | `COACH_EMAILS` allowlist + Anthropic workspace spend limit | Zero surprise cost for a family-only MVP | Plan |
| Free plan | Stay on Workers free plan, watch for CPU errors | Cost first; decided before planning | Plan |
| Limits in code, retry once, then default | Validator inside the retry loop; violations fed back to attempt 2 | PRD guardrail + AGENTS.md hard rule | Research |
| Derived (veto at review) | Latest = `rowed_on` then `created_at`; suggestion for a type with no history = violation; limit 2 triggered by a water DPS clear drop caps either type; default clamped to the volume cap | Needed to make the rules deterministic | Plan |

## Scope

**In scope:** sessions + suggestions tables with RLS; log form and session page; metrics, labels, limit context and validator; small tool-using agent with retry and feedback; suggestion endpoint and island; dashboard links; allowlist rename; try-it endpoint removal; unit, rls-check and smoke coverage.

**Out of scope:** session list/edit/delete (S-03), done/skipped (S-04), trends (S-05), new decline thresholds, per-rower thresholds, per-split entry, imports, streaming, daily caps, Workers Paid, regenerating stored suggestions.

## Architecture / Approach

Form POST stores the session → `/sessions/<id>` loads session, history, profile and goals, and computes the analysis in pure TS (`metrics.ts`). The island calls `POST /api/sessions/<id>/suggestion`: stored row → return; not allowlisted → default; else build a `CoachingContext`, run the SDK tool runner with tools over that in-memory context, parse the final answer, validate with `limits.ts`, retry once with violation feedback, fall back to the clamped default, store and return.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session logging and storage | Tables + RLS, types, log form, session page, rls-check/smoke | Migration must be pushed before the commit |
| 2. Metrics and safety-limits engine | Deterministic analysis, limit context, validator, clamped default; analysis on page | Definition edge cases (boundaries, missing data) |
| 3. Coaching agent service | Spike, tools, agent with validated retry loop and 90 s deadline; try-it endpoint removed | Tools + structured output + fallbacks untested together |
| 4. Endpoint, UI and cutover | Suggestion API + island, dashboard, allowlist rename | Latency (est. 15–25 s) and Workers CPU on the free plan |

**Prerequisites:** F-01 and S-01 done (yes); user can run `npx supabase db push`; user sets `COACH_EMAILS` secret and an Anthropic spend limit in phase 4.
**Estimated effort:** ~4 sessions, one per phase.

## Open Risks & Assumptions

- The API may reject `output_config.format` alongside tools or with fallbacks — the phase 3 spike decides; fallback design is a final `.parse` call without tools.
- Multi-turn agent latency and CPU are estimates; the stored suggestion limits repeat cost.
- The derived rules above are planner choices; change them at plan review if they don't match how you train.

## Success Criteria (Summary)

- Logging the same data twice gives the same metrics; a 0.3 m DPS drop yields a ≤ 32 spm suggestion; a limit-breaking suggestion is never shown.
- A distance + time-only session still gets an analysis and a suggestion.
- Only allowlisted rowers cause model calls; reloads don't call the model again.
