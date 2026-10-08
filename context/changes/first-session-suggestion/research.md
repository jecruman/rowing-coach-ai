---
date: 2026-10-08T21:02:53+02:00
researcher: Claude (Opus 5.5) for jecruman
git_commit: 5274060
branch: main
repository: jecruman/rowing-coach-ai
topic: "What S-02 first-session-suggestion builds on, what is settled, and what planning must decide"
tags: [research, coaching, metrics, safety-limits, sessions, supabase, anthropic-sdk, cloudflare-workers]
status: complete
last_updated: 2026-10-08
last_updated_by: Claude (Opus 5.5)
---

# Research: S-02 `first-session-suggestion` — foundations, settled rules, open decisions

**Date**: 2026-10-08T21:02:53+02:00
**Researcher**: Claude (Opus 5.5) for jecruman
**Git Commit**: 5274060
**Branch**: main
**Repository**: jecruman/rowing-coach-ai

## Research Question

For roadmap slice S-02 (`first-session-suggestion`, Linear JES-13 — "user can log an erg or water session with type-specific fields and an optional comment, see its computed metrics against their recent baseline, and get one suggested next session that passes the safety limits (or the labelled safe default)"): what existing code and data can it build on, what do the product documents already settle, what remains undecided, and what does an agent-with-tools implementation imply on the installed SDK and Cloudflare Workers free plan?

## Summary

- **Reusable foundations exist.** F-01 left a tested coaching service (one structured model call, retry once, safe default, fenced user text) and S-01 left the per-user table pattern (RLS, `set_updated_at`, generated types, `rls-check`, types-vs-migrations CI check) plus profile and goal data. S-02 adds a sessions table, metric computation, a safety-limit validator, persisted suggestions and the logging UI.
- **The product rules are mostly settled** in the PRD Business Logic: baseline = average of the last 3 same-type sessions; DPS and pace thresholds; three safety limits; safe default; suggestion contents; comments never affect metrics or limits.
- **About 15 definitions are not settled** and must be decided in `/10x-plan` — most importantly the baseline for the first sessions (the slice's own name case), how "split drift", "volume" and "easy" are measured, and what makes a session "hard" when pace or goal is missing.
- **An agent with tools is feasible** with the installed SDK (`client.beta.messages.toolRunner` + `betaZodTool`, v0.131.0) on Workers, but costs roughly 3–5 model round-trips per suggestion versus 1 today (latency and token cost scale accordingly; estimate, not measured). A minimal variant — in-memory tools over preloaded data, metrics and limit checks in code before and after the loop — keeps the learning goal while preserving the "metrics and limits in code" rule. No document makes the agent a requirement for S-02.

## Detailed Findings

### 1. Coaching service from F-01 (reuse and extend)

- Input contract `CoachingInputSchema = { session, goal: string ≤ 200, comment? ≤ 1000 }`; `session` = `type`, optional `distanceMeters` (≤ 100 000), `durationMinutes` (≤ 600), `splitsPer500m` (≤ 200 strings of ≤ 10 chars), `spmRange`, `dpsRange` (≤ 20 chars), `notes` (≤ 1000) (`src/lib/services/coaching/schema.ts:10-24`).
- Output contract `CoachingSuggestionSchema = { sessionType, structure, targets: { maxSpm?, spmRange?, pacePer500m? }, focus, reason, techniqueTip }` (`schema.ts:27-38`); `safeDefaultSuggestion(sessionType)` = steady technique row, 30–40 min, `maxSpm` 22, focus "Long strokes" (`schema.ts:43`).
- `getCoachingSuggestion(input, { client, model })` returns `{ suggestion, isDefault, attempts: 1 | 2, model }` (`getCoachingSuggestion.ts:100`). It validates input first and throws `InvalidCoachingInputError` before any model call (`:11`). An attempt fails on a thrown error, `stop_reason === "refusal"` or `parsed_output === null` (`:69-93`); at most 2 attempts (`MAX_ATTEMPTS`, `:35`). Request params: `client.beta.messages.parse`, `max_tokens` 16000, `effort: "low"`, `betaZodOutputFormat`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` (`:59-67`). User data is fenced in `<session>`, `<goal>`, `<rower_comment>` tags and the system prompt marks it as data (`:38`, `:43`).
- Client: `createCoachingClient()` returns `null` without `ANTHROPIC_API_KEY`; `maxRetries: 0`, 60 s timeout, so the worst case on this path is 2 × 60 s (`client.ts:15`).
- **Gaps S-02 must close** (inspected files only): the input carries no history, baseline or computed metrics and no profile fields; `goal` is a free string, so S-02 must render it from `RowerGoal`; there is **no safety-limit check on the output** — `targets.maxSpm` is optional and `structure` is free text with no duration or intensity field, so limits 1 and 3 cannot be validated against today's schema without new structured fields; results are not persisted.
- `src/pages/api/coaching/try.ts` is a temporary endpoint (fixed PRD sample, `COACH_TRY_EMAILS` allowlist; comment at `:30` says "S-02 replaces it"). Replacing it implies removing `allowlist.ts` + test and `COACH_TRY_EMAILS` from `astro.config.mjs:31` unless kept deliberately.

### 2. Data and UI patterns from S-01 (reuse)

- Migration pattern: `supabase/migrations/20261008151626_create_profiles_and_goals.sql` — shared `public.set_updated_at()` (`:6-15`, `search_path = ''`), `user_id default auth.uid() references auth.users on delete cascade`, CHECK constraints, RLS with four per-operation policies for `authenticated` named `<table>_<op>_own` using `(select auth.uid())`, update policy with `using` + `with check`.
- `src/db/database.types.ts` lists only `goals` (`:42`) and `profiles` (`:75`); a new table requires regeneration (`gen types --linked`), and CI fails if the committed file drifts from migrations (`.github/workflows/ci.yml:48-56`).
- Helpers: `parseTime` / `formatTime` / `pacePer500` (`src/lib/services/profile/rules.ts:21`, `:33`, `:46`) cover split and pace parsing; `loadProfileAndGoals(supabase, userId) → { profile, goals: Partial<Record<SessionType, RowerGoal>>, loadFailed }` (`load.ts:7-56`) is the pattern for loading recent sessions; `src/types.ts` holds entities (`SessionType`, `Boat`, `RowerProfile`, `RowerGoal`).
- Form endpoint pattern: `src/pages/api/goals.ts` — auth redirect (`:16`), guarded `formData()` (`:20-26`), zod `safeParse` → `?error=`, write with explicit `user_id`, redirect `?saved=`. Pages: `profile.astro` (capped `?error`, `SAVED_MESSAGES`, `loadFailed` banner), `dashboard.astro` (natural entry point for "log a session" and the latest suggestion). New pages must be added to `PROTECTED_ROUTES` (`src/middleware.ts:4`).
- Verification: `scripts/rls-check.mjs` has a `steps` array and `ownerMoveRejected` helper (`:54`, `:70-184`) to extend for a sessions table; `scripts/smoke.mjs` `request()` helper and steps (`:23`, `:38-84`). The smoke job has **no Anthropic key**, so a suggestion step in smoke will exercise the "not configured" path, not a real model call.

### 3. Product rules already settled

Sources: `context/foundation/prd.md` (FR-004/005/007/008, US-01, Business Logic, NFRs), `roadmap.md` (S-02), `shape-notes.md` (Forward: technical-roadmap).

- Session fields (FR-004): erg — distance, time, splits, SPM, optional watts; water — distance, time, splits, SPM, DPS, optional boat. Comment (FR-005).
- Metrics: compared with the average of the last 3 sessions of the same type — pace /500 m, split drift, SPM range, DPS on water. Thresholds: DPS +0.5 m huge improvement, −0.3 m clear drop; pace −5 s/500 m good improvement.
- Safety limits (verbatim from PRD Business Logic): "(1) volume (distance/time) at most +10% over the 3-session average of that type; (2) after a clear DPS drop, the next session caps the rate at 32 spm; (3) after 2 hard sessions in a row, the next must be easy — 'hard' = pace at or faster than goal pace +5 s/500 m".
- Fallback: retry once, then the safe default labelled as a default. Comments inform the suggestion only, never metrics or limit checks. Guardrail: same input → same metrics and limit checks.
- US-01 acceptance criteria relevant to S-02: same data → same metrics; clear DPS drop → suggestion caps rate at 32 spm; limit-breaking suggestion never shown (retry, then default); a distance + time-only session still gets an analysis and a suggestion. (The done/skipped criterion belongs to S-04.)
- NFRs: results "within a few seconds, with visible progress while waiting"; usable on a phone. Measured on F-01: 8.2 s wall, 21 ms CPU per coaching request (`context/archive/2026-10-07-coaching-model-access/change.md`).
- Lessons (`context/foundation/lessons.md`): fence and length-limit every user-written field sent to the model; push the migration and regenerate types before code that needs it.

### 4. Undecided definitions (planning must resolve)

1. **Baseline before 3 sessions** — the first session of a type has no baseline at all (PRD Open Question 3; roadmap marks it non-blocking, but it is the slice's headline case).
2. **Split drift** — not defined (last − first split? slope? compared with baseline?).
3. **Pace and SPM range source** — whole-session average vs from splits; pace from distance + time when splits are missing.
4. **Baseline composition** — does it include the session just logged; any time window.
5. **Volume (limit 1)** — distance or time; for intervals, work only or including rest.
6. **"Easy" (limit 3)** — not defined; also whether "hard" is judged by average or per-split pace.
7. **"Hard" with missing data** — no pace, or no goal for that type → no goal pace.
8. **Goal pace conversion** — goals are distance + target time; "goal pace + 5 s/500 m" needs `pacePer500(goal)`.
9. **Limit 2 scope** — DPS is recorded for water sessions only (FR-004), so as written the trigger (a clear DPS drop) can come only from a water session; whether the 32 spm cap then also applies to a following erg suggestion, and whether the drop is judged on the just-logged session vs its baseline, is not stated.
10. **Limits across types** — does a hard erg session count toward "2 hard in a row" before a water suggestion?
11. **Suggestion shape for validation** — limits 1 and 3 need structured volume/intensity fields in the model output (today free text).
12. **SPM rise / pace decline thresholds** (PRD OQ2) and **named technique verdict** (OQ4).
13. **Response time target** (OQ5) given 8.2 s for one call.
14. **Rule priority** — shape-notes records "safety/recovery > technique > intensity"; the PRD omits it.
15. **Cost exposure with open sign-up** (PRD OQ1, roadmap: decide before sharing beyond the family) — the try-it allowlist goes away when S-02 replaces it.

### 5. Agent with tools on the installed SDK and Workers

- SDK `@anthropic-ai/sdk` 0.131.0 (`node_modules/@anthropic-ai/sdk/package.json:3`) provides `client.beta.messages.toolRunner` (`src/resources/beta/messages/messages.ts:223-233`) with `max_iterations` (`src/lib/tools/BetaToolRunner.ts:134-135`) and `betaZodTool` (`src/helpers/beta/zod.ts:46`); a tool's thrown error becomes an `is_error` tool result rather than a crash (per subagent reading of `BetaRunnableTool.ts:89-93`; not re-verified).
- The runner calls `client.beta.messages.create` (`BetaToolRunner.ts:245`), not `.parse`, so the final structured answer must be parsed and validated by our code (today `.parse` does it). Whether `output_config.format` is accepted on intermediate tool-use turns, and how `fallbacks` behaves mid-loop, were **not verified**.
- Forced `tool_choice` (`any` / `tool`) is allowed by the SDK types (`messages.ts:5405-5462`); Anthropic's guidance for `claude-opus-5-5` is that it is rejected server-side — use `auto` plus a prompt instruction.
- Workers fit: the runner path uses the client's `fetch` and no Node-only modules (subagent inspection; F-01 already proved `messages.parse` on workerd). Free plan per request: 50 subrequests, 10 ms CPU (outbound waits are wall time), 6 concurrent outgoing connections (https://developers.cloudflare.com/workers/platform/limits/). The project decided to stay on the free plan and upgrade only on CPU-limit errors.
- Cost estimate (not measured): a tool loop needs about 3–5 model requests per suggestion versus 1; latency and input tokens scale roughly with turns; subrequests stay far below 50, doubled by the retry-once policy.
- Minimal agentic variant (option, not decision): preload profile, goal and recent sessions in code; compute metrics in code; expose `getAthleteProfile`, `getTrainingHistory`, `calculateTrainingMetrics` as in-memory tools; cap `max_iterations` (~4); persist and run the limit validator in code after the loop; keep the safe default. `saveRecommendation` stays in code, not a model tool.

## Code References

- `src/lib/services/coaching/schema.ts:10-43` — input/output schemas, safe default
- `src/lib/services/coaching/getCoachingSuggestion.ts:35-100` — attempt loop, request params, fencing
- `src/lib/services/coaching/client.ts:15` — `maxRetries: 0`, 60 s timeout
- `src/pages/api/coaching/try.ts:30` — temporary endpoint to replace
- `supabase/migrations/20261008151626_create_profiles_and_goals.sql:6-87` — table/RLS/trigger pattern
- `src/lib/services/profile/rules.ts:21-46` — time and pace helpers
- `src/lib/services/profile/load.ts:7-56` — loader with `loadFailed`
- `src/pages/api/goals.ts:16-43` — form endpoint pattern
- `src/middleware.ts:4` — `PROTECTED_ROUTES`
- `scripts/rls-check.mjs:54-184`, `scripts/smoke.mjs:23-84`, `.github/workflows/ci.yml:44-56` — verification
- `node_modules/@anthropic-ai/sdk/src/resources/beta/messages/messages.ts:223-233`, `src/lib/tools/BetaToolRunner.ts:134,245`, `src/helpers/beta/zod.ts:46` — tool runner

## Architecture Insights

- Determinism boundary: everything the PRD guarantees (metrics, limits, fallback) is code; the model only chooses within limits. An agent loop changes how the model gathers context, not this boundary.
- The retry loop is the natural place for the limit validator: a limit-breaking answer counts as a failed attempt, so "retry once, then default" covers both invalid shape and limit violations.
- Every new table follows the S-01 pattern and adds `rls-check` steps; migration + regenerated types land together and are pushed before dependent code (lesson).

## Historical Context (from prior changes)

- `context/archive/2026-10-07-coaching-model-access/plan.md` — "What We're NOT Doing" assigned sessions, metrics, limits, tables, UI, the agent with tools and spending caps to S-02; its review added `maxRetries: 0` + timeout and input fencing.
- `context/archive/2026-10-08-rower-profile-and-goals/plan.md` — goals stored as distance + target time (no pace-only goals); RLS and types patterns; lesson on schema-before-code.

## Related Research

Not applicable — first `research.md` in this repository.

## Open Questions

The 15 definitions in "Undecided definitions" above are product/design decisions for `/10x-plan`, not research gaps. Research gaps that remain: API behavior of `output_config.format` on intermediate tool-use turns, `fallbacks` mid-loop, and real latency/CPU of a multi-turn loop on Workers — each would need a spike against the real API.
