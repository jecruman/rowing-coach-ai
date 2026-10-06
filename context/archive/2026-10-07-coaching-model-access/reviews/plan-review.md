<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Coaching Model Access Implementation Plan

- **Plan**: context/changes/coaching-model-access/plan.md
- **Mode**: Deep
- **Date**: 2026-10-07
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
6/6 paths ✓, 3/3 symbols ✓ (`env.schema`, `PROTECTED_ROUTES`, `locals.user`), brief↔plan ✓. No `lessons.md` or `contract-surfaces.md`.

## Findings

### F1 — Anonymous-request check expects 401 but will get 403

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Success Criteria 2.4
- **Detail**: Astro `security.checkOrigin` is on by default (`astro/dist/core/config/schemas/defaults.js:44`) and returns 403 for a POST with no content-type and no matching Origin (`dist/core/app/origin-check.js`), so the planned curl never reaches the handler.
- **Fix**: Send `Content-Type: application/json` with an empty JSON body in the curl; keep the 401 expectation.
- **Decision**: FIXED

### F2 — Vitest can't load `astro:env/server` without Astro's Vite config

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — §1 Dependencies, §6 Unit tests
- **Detail**: No Vitest config planned; `astro:env/server` is a virtual module from Astro's Vite plugin. Astro 7.3.2 uses vitest ^4.1 (`astro/package.json:195`).
- **Fix A ⭐ Recommended**: Add `vitest.config.ts` with `getViteConfig()`; pin vitest to Astro's major.
  - Strength: Tests can import anything; documented Astro setup.
  - Tradeoff: One more config file; slower test start.
  - Confidence: MED — not yet run with Astro 7 + Cloudflare adapter.
  - Blind spot: Adapter's Vite plugins may need excluding in test mode.
- **Fix B**: No config; rule that service/schema never import `astro:env/*`.
  - Strength: Zero config; clean pure-logic boundary.
  - Tradeoff: Prose-only rule; easy to break in S-02.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F3 — Refusal fallback needs the beta parse call

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details; Phase 1 §4, §6
- **Detail**: Only `client.beta.messages.parse` accepts `fallbacks` (`@anthropic-ai/sdk` `resources/beta/messages/messages.d.ts:5282`); plan named `client.messages.parse` and left it conditional.
- **Fix**: Use `client.beta.messages.parse` with `fallbacks: "default"` and beta `server-side-fallback-2026-07-01`; fake client mocks `beta.messages.parse`.
- **Decision**: FIXED

### F4 — Try-it endpoint stays live with no spending guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — §1 Try-it endpoint
- **Detail**: Open sign-up means any registered user could call the endpoint repeatedly (up to 2 Opus 5.5 requests each); endpoint's fate after verification was unstated.
- **Fix A ⭐ Recommended**: Restrict to an email allowlist (`COACH_TRY_EMAILS`); others get 403.
  - Strength: Usable for the owner while S-02 is built.
  - Tradeoff: One more setting until S-02 replaces the endpoint.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B**: Remove the endpoint at the end of Phase 2.
  - Strength: Nothing billable left exposed.
  - Tradeoff: No production re-test until S-02.
  - Confidence: HIGH.
  - Blind spot: S-02 may need it for prompt iteration.
- **Decision**: FIXED (Fix A)

### F5 — Safe default's session type is undefined

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3
- **Detail**: Schema requires `sessionType` erg|water; the PRD safe default names neither.
- **Fix**: Safe default takes the input session's type; test case added.
- **Decision**: FIXED

### F6 — COACH_MODEL access left as "secret or public"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2
- **Detail**: `default` is allowed with `access: "secret"` (`astro/dist/env/schema.js`).
- **Fix**: server / secret / optional, default `"claude-opus-5-5"`.
- **Decision**: FIXED

### F7 — durationMs meaning with a retry

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1
- **Detail**: Unclear whether it covers one attempt or both; feeds the response-time decision.
- **Fix**: Total wall time from handler start to response, all attempts included; `attempts` reported alongside.
- **Decision**: FIXED
