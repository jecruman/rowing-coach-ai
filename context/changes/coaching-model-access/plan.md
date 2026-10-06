# Coaching Model Access Implementation Plan

## Overview

Prove that the deployed Cloudflare Worker can ask Claude for one structured next-session suggestion and get back an answer that is validated against a schema — with one retry and the PRD's safe default when the answer is missing or invalid. This is roadmap foundation F-01 (`coaching-model-access`, Linear JES-11); it unlocks S-02 (`first-session-suggestion`), which adds computed metrics and the three safety limits on top of this service.

## Current State Analysis

- No model integration exists. Server secrets follow one pattern: declared in `env.schema` in `astro.config.mjs` (`SUPABASE_URL`, `SUPABASE_KEY`, both `optional: true`) and imported from `astro:env/server` (`src/lib/supabase.ts:3`).
- API routes live in `src/pages/api/**`, export uppercase handlers and use `context.redirect` for form flows (`src/pages/api/auth/signin.ts:4`).
- `src/middleware.ts:4` protects only `/dashboard` via `PROTECTED_ROUTES`; `/api/*` routes are reachable anonymously unless the handler checks `context.locals.user` (set by the middleware on every request, `src/middleware.ts:10-15`).
- `zod` is only a transitive dependency (via Astro); AGENTS.md requires zod validation for API input. There is no unit-test runner — `npm run smoke` is the only automated check; CI (`.github/workflows/ci.yml`) runs `ci` (lint, astro check, build) and `smoke`, then `deploy` on `main`.
- `infrastructure.md` risk register: a model client that assumes full Node can build cleanly and fail only at runtime on Workers; free-plan CPU limit 10 ms/request (outbound waits don't count).

## Desired End State

A signed-in user can `POST /api/coaching/try` on the deployed Worker and receive JSON with one suggested next session (type, structure, targets, focus, reason, technique tip), a flag saying whether it is the safe default, the model used, and the duration. Anonymous callers get 401. Unit tests prove the success, retry-once and safe-default paths without network calls, and run in CI.

### Key Discoveries:

- Secret pattern to copy: `astro.config.mjs` `env.schema` + `astro:env/server` (`src/lib/supabase.ts:3`).
- Auth check pattern: `context.locals.user` is populated for every request by `src/middleware.ts:10-15`.
- Structured output with the official SDK: `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` from `@anthropic-ai/sdk/helpers/zod`; `response.parsed_output` is `null` when parsing fails.
- Claude Opus 5.5 (`claude-opus-5-5`): thinking cannot be disabled; control cost/latency with `output_config.effort` (default `medium`); no assistant prefill; responses may end with `stop_reason: "refusal"`.

## What We're NOT Doing

- No session logging, computed metrics, baseline or the three safety limits (volume cap, 32 spm cap, recovery after 2 hard sessions) — all S-02.
- No database tables, migrations or UI pages.
- No agent with tools yet — this is a single structured call; the agent loop comes when S-02 needs history and metrics tools.
- No real model calls in CI; no GitHub secret for the API key (the key is optional at build time).
- No general rate limit or spending cap; the try-it endpoint is limited to an email allowlist (roadmap Open Question 1 stays open for S-02).
- No prompt tuning or evals of coaching quality.

## Implementation Approach

Build the service as a pure function with the API client injected, so tests can pass a fake; validate the model answer with a zod schema through the SDK's structured-output helper; treat every failure (thrown error, refusal, `parsed_output === null`) the same way: retry once, then return the safe default. Expose it through one signed-in endpoint fed with the PRD's sample session, and verify on the deployed Worker.

## Critical Implementation Details

- **Refusal fallback:** call `client.beta.messages.parse` (not `client.messages.parse`) with `fallbacks: "default"` and beta `server-side-fallback-2026-07-01` — only the beta method accepts `fallbacks` (`@anthropic-ai/sdk` `resources/beta/messages/messages.d.ts`). A final `stop_reason: "refusal"` still counts as an invalid answer → retry once → safe default.
- **zod:** `zodOutputFormat` imports `zod/v4`; the SDK's optional peer range is `^3.25.0 || ^4.0.0`. Use zod 4 as the direct dependency (4.6.2 is already in the tree).
- **Astro origin check:** `security.checkOrigin` is on by default; a POST with no or form-like content-type and no matching `Origin` gets 403 before reaching the handler. Test calls must send `Content-Type: application/json`.
- **Tests and `astro:env`:** `astro:env/server` is a virtual module from Astro's Vite plugin, so Vitest runs through `getViteConfig()` from `astro/config` (Astro's documented testing setup).

## Phase 1: Coaching service and tests

### Overview

Add the dependencies, declare the secrets, implement the coaching service with schema, retry-once and safe default, and cover it with unit tests that run in CI.

### Changes Required:

#### 1. Dependencies and scripts

**File**: `package.json`

**Intent**: Add the official Anthropic SDK and zod as runtime dependencies, Vitest as a dev dependency, and a `test` script, so the service has a client, validation and a test runner.

**Contract**: dependencies `@anthropic-ai/sdk`, `zod` (^4); devDependency `vitest` pinned to the major Astro 7.3 itself uses (^4.1, per `node_modules/astro/package.json`); script `"test": "vitest run"`.

#### 1b. Vitest config

**File**: `vitest.config.ts`

**Intent**: Run tests through Astro's Vite config so modules importing `astro:env/server` resolve in tests, now and in S-02.

**Contract**: default export `getViteConfig({ test: { include: ["src/**/*.test.ts"] } })` from `astro/config`. If the Cloudflare adapter's Vite plugins break test startup, exclude them in test mode and note it in the phase commit.

#### 2. Secret and config declaration

**File**: `astro.config.mjs`

**Intent**: Declare the model key and model name as server-only settings so they are read like the Supabase secrets and never reach the client.

**Contract**: `env.schema` gains `ANTHROPIC_API_KEY` (`envField.string`, context server, access secret, optional), `COACH_MODEL` (`envField.string`, context server, access secret, optional, default `"claude-opus-5-5"`) and `COACH_TRY_EMAILS` (`envField.string`, context server, access secret, optional; comma-separated emails allowed to call the try-it endpoint). `.env.example` gains all three keys with placeholder values.

#### 3. Suggestion schema and safe default

**File**: `src/lib/services/coaching/schema.ts`

**Intent**: Define the shape of one suggested next session and the PRD's safe default, so the model's answer and the fallback share one type.

**Contract**: zod schema `CoachingSuggestionSchema` with fields: `sessionType` (`"erg" | "water"`), `structure` (string, e.g. "6 × 2 min / 2 min rest"), `targets` (object: `maxSpm` optional number, `spmRange` optional string, `pacePer500m` optional string), `focus` (string), `reason` (string), `techniqueTip` (string). Exported type `CoachingSuggestion`. Function `safeDefaultSuggestion(sessionType)` returns the PRD safe default — steady technique row, 30–40 min, max 22 spm, focus on long strokes — with `sessionType` equal to the input session's type (the PRD names no type for it).

#### 4. Coaching service

**File**: `src/lib/services/coaching/getCoachingSuggestion.ts`

**Intent**: Ask Claude for one suggestion from a session description and goal, validate it, retry once on any failure, and otherwise return the safe default — the exact failure path S-02 builds on.

**Contract**: `getCoachingSuggestion(input, deps) => Promise<CoachingResult>` where `input` = `{ session, goal, comment? }`, `deps` = `{ client, model }`, and `CoachingResult` = `{ suggestion: CoachingSuggestion, isDefault: boolean, attempts: 1 | 2, model: string }`. One call uses `client.beta.messages.parse` with `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, `output_config: { effort: "low", format: zodOutputFormat(CoachingSuggestionSchema) }`, a fixed system prompt (senior rowing coach for a masters amateur, one next session only), and `max_tokens` of ~16000. An attempt fails when the call throws, `stop_reason === "refusal"`, or `parsed_output` is `null`. At most 2 attempts; after 2 failures return `safeDefaultSuggestion(input.session.type)` with `isDefault: true`. Errors are logged with `console.error` (visible in `wrangler tail`), never the API key.

#### 5. Client factory

**File**: `src/lib/services/coaching/client.ts`

**Intent**: Build the Anthropic client from the declared secret in one place, returning `null` when the key is missing, mirroring `createClient` in `src/lib/supabase.ts`.

**Contract**: `createCoachingClient() => Anthropic | null`, reading `ANTHROPIC_API_KEY` and `COACH_MODEL` from `astro:env/server`; exported `coachModel` resolves to `COACH_MODEL ?? "claude-opus-5-5"`.

#### 6. Unit tests

**File**: `src/lib/services/coaching/getCoachingSuggestion.test.ts`

**Intent**: Prove the service's behavior with a fake client so CI never calls the real API.

**Contract**: the fake client implements `beta.messages.parse`. Cases — (a) valid first answer → returned, `isDefault: false`, `attempts: 1`, one call; (b) invalid (`parsed_output: null`) then valid → second answer, `attempts: 2`; (c) two failures → safe default, `isDefault: true`, exactly two calls; (d) thrown error then thrown error → safe default; (e) `stop_reason: "refusal"` treated as invalid; (f) the request sent uses the injected model, `effort: "low"` and `fallbacks: "default"`; (g) safe default for an erg input has `sessionType: "erg"` and for a water input `"water"`.

#### 7. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Run the unit tests on every push and PR, before build, so the deploy job only runs when they pass.

**Contract**: `ci` job gains a `npm test` step after `npm run lint`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes without `ANTHROPIC_API_KEY` set: `npm run build`
- CI `ci` job runs `npm test` and passes on push

#### Manual Verification:

- Reviewer confirms the suggestion schema fields match what S-02 will need (type, structure, targets, focus, reason, technique tip)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Signed-in endpoint and deployed check

### Overview

Expose the service through one signed-in endpoint fed with the PRD's sample session, set the production secret, and verify the call works on the deployed Worker.

### Changes Required:

#### 1. Try-it endpoint

**File**: `src/pages/api/coaching/try.ts`

**Intent**: Let an allowlisted signed-in user trigger one coaching call on the deployed Worker without any product UI, while keeping anonymous callers and other registered users (sign-up is open) from spending API credit. S-02 replaces this endpoint with the real flow.

**Contract**: `POST` handler; `export const prerender = false`. Returns `401` JSON when `context.locals.user` is null; `403` JSON when the user's email (case-insensitive) is not in `COACH_TRY_EMAILS` (unset → nobody allowed); `503` JSON when `createCoachingClient()` returns `null`; otherwise calls `getCoachingSuggestion` with a fixed sample input from the PRD (water, 5000 m, 500 m splits 1:52 / 1:54 / 1:55 …, SPM 28–30, DPS 8.1–8.5, goal 3:50/1000 m) and returns `200` JSON `{ suggestion, isDefault, attempts, model, durationMs }`, where `durationMs` is total wall time from handler start to response, all attempts included.

#### 2. Secrets (user action)

**File**: — (Cloudflare Worker secrets, `.dev.vars`)

**Intent**: Make the key available locally and in production without committing it.

**Contract**: user creates an Anthropic API key; adds `ANTHROPIC_API_KEY=...` and `COACH_TRY_EMAILS=<own email>` to `.dev.vars` and `.env`; runs `npx wrangler secret put ANTHROPIC_API_KEY` and `npx wrangler secret put COACH_TRY_EMAILS`. `COACH_MODEL` is left unset (default applies).

### Success Criteria:

#### Automated Verification:

- Unit tests still pass: `npm test`
- Lint and type check pass: `npm run lint` and `npx astro check`
- Smoke test still passes in CI: `smoke` job
- Anonymous request is rejected on the deployed Worker: `curl -s -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{}' https://rowing-coach-ai.jecruman.workers.dev/api/coaching/try` returns `401`

#### Manual Verification:

- Signed in with an allowlisted email on the deployed app, a POST to `/api/coaching/try` returns a suggestion with `isDefault: false` and a sensible session for the sample data; signed in with a non-allowlisted account it returns `403`
- `npx wrangler tail` shows no runtime errors for the call; the Workers dashboard shows CPU time per request under the free plan's 10 ms limit (or the result is recorded so the $5 plan decision can be made)
- `durationMs` for the call is recorded as the first data point for the PRD's open "analysis response target" question

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Coaching service with a fake client: success, invalid-then-valid, two invalid, two thrown errors, refusal, request parameters (model, effort, fallbacks), safe default matches the input session type.

### Integration Tests:

- None automated in this change; the deployed check in Phase 2 is the integration test for the Workers runtime.

### Manual Testing Steps:

1. Sign in on https://rowing-coach-ai.jecruman.workers.dev.
2. From the browser console on the same site: `fetch("/api/coaching/try", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(r => r.json()).then(console.log)`.
3. Check the returned suggestion and `durationMs`; run `npx wrangler tail` in parallel and check CPU time in the dashboard.
4. Sign out and repeat step 2 — expect `401`; sign in with an account not in `COACH_TRY_EMAILS` — expect `403`.

## Performance Considerations

Each call is one model request at `effort: "low"`, with at most one retry; waiting on the API counts as wall time, not CPU time, on Workers. SSR plus JSON parsing must stay under the 10 ms free-plan CPU limit — measured in Phase 2.

## Migration Notes

None — no data or schema changes.

## References

- Roadmap item: `context/foundation/roadmap.md` → F-01 (Linear JES-11)
- PRD Business Logic (safe default, retry once): `context/foundation/prd.md`
- Risks: `context/foundation/infrastructure.md` → Risk Register
- Secret pattern: `src/lib/supabase.ts:3`; auth check: `src/middleware.ts:10-15`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Coaching service and tests

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type check passes: `npx astro check`
- [x] 1.4 Build passes without `ANTHROPIC_API_KEY` set: `npm run build`
- [ ] 1.5 CI `ci` job runs `npm test` and passes on push

#### Manual

- [x] 1.6 Reviewer confirms the suggestion schema fields match what S-02 will need (type, structure, targets, focus, reason, technique tip)

### Phase 2: Signed-in endpoint and deployed check

#### Automated

- [ ] 2.1 Unit tests still pass: `npm test`
- [ ] 2.2 Lint and type check pass: `npm run lint` and `npx astro check`
- [ ] 2.3 Smoke test still passes in CI: `smoke` job
- [ ] 2.4 Anonymous request is rejected on the deployed Worker: `curl -s -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" -d '{}' https://rowing-coach-ai.jecruman.workers.dev/api/coaching/try` returns `401`

#### Manual

- [ ] 2.5 Signed in with an allowlisted email on the deployed app, a POST to `/api/coaching/try` returns a suggestion with `isDefault: false` and a sensible session for the sample data; signed in with a non-allowlisted account it returns `403`
- [ ] 2.6 `npx wrangler tail` shows no runtime errors for the call; the Workers dashboard shows CPU time per request under the free plan's 10 ms limit (or the result is recorded so the $5 plan decision can be made)
- [ ] 2.7 `durationMs` for the call is recorded as the first data point for the PRD's open "analysis response target" question
