# Coaching Model Access — Plan Brief

> Full plan: `context/changes/coaching-model-access/plan.md`

## What & Why

Roadmap foundation F-01: prove that the deployed Cloudflare Worker can ask Claude for one structured next-session suggestion, validate the answer, and fall back safely. It retires the biggest technical risk before the north star (S-02) — a model client that fails only at runtime on Workers — and builds the "invalid answer → retry once → safe default" path S-02 relies on.

## Starting Point

The app has auth (Supabase), deploy (Cloudflare Workers) and CI/CD on `main`, but no model integration, no unit-test runner, and no domain endpoints. Secrets follow the `env.schema` + `astro:env/server` pattern used for Supabase.

## Desired End State

An allowlisted signed-in user can `POST /api/coaching/try` on the deployed app and get a JSON suggestion (type, structure, targets, focus, reason, technique tip) plus `isDefault`, `model` and `durationMs`; anonymous calls get 401 and non-allowlisted users 403. Unit tests for success, retry-once and safe-default run in CI without calling the real API.

## Key Decisions Made

| Decision            | Choice                                                     | Why (1 sentence) |
| ------------------- | ---------------------------------------------------------- | ---------------- |
| Provider            | Anthropic API via the official `@anthropic-ai/sdk`         | Native structured output; the SDK is fetch-based, so it fits Workers. |
| Model               | Claude Opus 5.5 (`claude-opus-5-5`), `effort: "low"`, configurable via `COACH_MODEL` | Best coaching judgment; low effort keeps cost and latency down; switchable without code changes. |
| Validation          | `messages.parse()` + zod schema                            | Answer shape is checked automatically; same zod used for API input per AGENTS.md. |
| Trigger             | Signed-in `POST /api/coaching/try` with the PRD sample session, limited to `COACH_TRY_EMAILS` | Proves the call on the deployed Worker; open sign-up means sign-in alone would not stop strangers spending API credit. |
| Failure path        | Error, refusal or invalid shape → retry once → PRD safe default (steady row 30–40 min, max 22 spm, same session type as the input) | Exactly the path S-02 needs; S-02 only adds the three safety limits. |
| Testing             | Add Vitest (^4, via Astro `getViteConfig()`); fake client; `npm test` in CI | First real test runner, needed anyway for S-02's metrics and limits; no API cost in CI. |
| Refusal fallback    | `client.beta.messages.parse` with `fallbacks: "default"` | Recommended for Opus 5.5; only the beta parse accepts it (verified); a final refusal still uses the retry/default path. |

## Scope

**In scope:** SDK + zod + Vitest; `ANTHROPIC_API_KEY` / `COACH_MODEL` / `COACH_TRY_EMAILS` settings; coaching service with schema, retry-once and safe default; unit tests in CI; signed-in try-it endpoint; production secret; deployed check.

**Out of scope:** session logging, metrics, baseline, the three safety limits, tables, UI, agent with tools, real API calls in CI, rate limiting / spending caps, prompt tuning.

## Architecture / Approach

`POST /api/coaching/try` → checks `locals.user` and the email allowlist → `createCoachingClient()` (key from `astro:env/server`) → `getCoachingSuggestion(input, { client, model })` → `client.beta.messages.parse` with the zod schema and refusal fallback → valid answer, or retry once, or `SAFE_DEFAULT_SUGGESTION`. The client is injected so tests pass a fake.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Coaching service and tests | Service, schema, safe default, Vitest tests in CI | Vitest startup with Astro + Cloudflare adapter config |
| 2. Signed-in endpoint and deployed check | Try-it endpoint, production secret, verified call on Workers | Runtime-only failure on Workers; CPU time near the 10 ms free limit |

**Prerequisites:** an Anthropic API account with billing and an API key (user action, before Phase 2).
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Tests rely on Astro's `getViteConfig()`; the Cloudflare adapter may need excluding in test mode.
- CPU time per request on the free plan is unmeasured; the $5 plan is the fallback.
- No general spending cap; the try-it endpoint is limited to an email allowlist (roadmap Open Question 1 stays open for S-02).

## Success Criteria (Summary)

- Signed in with an allowlisted email, the deployed app returns a valid Claude suggestion for the sample session; signed out it returns 401, other accounts 403.
- Unit tests prove retry-once and safe default, and run on every push.
- The first real response time and CPU time are recorded for later decisions.
