<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Coaching Model Access Implementation Plan

- **Plan**: context/changes/coaching-model-access/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria re-run 2026-10-07: `npm test` 7/7, `npx astro check` 0 errors, lint 0 real problems (CRLF-only messages excluded), deployed anonymous POST → 401, latest CI run green. All planned files MATCH; known adaptations (betaZodOutputFormat, adapter off under VITEST, coachModel from schema default, string goal, illustrative splits) verified as described.

Not raised: lowering `max_tokens` (16000) — Claude Opus 5.5 thinking cannot be disabled and thinking tokens count toward `max_tokens`; the Claude API guidance is ~16000 for non-streaming requests.

## Findings

### F1 — SDK retries break "retry once"; 10-minute default timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/coaching/client.ts:12
- **Detail**: `new Anthropic({ apiKey })` keeps SDK defaults `maxRetries: 2` and a 10-minute timeout. Each of the service's 2 attempts can make up to 3 HTTP calls (6 total), contradicting the plan's "retry once", and a hung upstream can hold the request for minutes per call.
- **Fix**: Construct the client with `maxRetries: 0` and an explicit `timeout` (e.g. 60 000 ms), so the service loop is the only retry layer and worst case is 2 × timeout.
  - Strength: Restores the planned retry semantics; bounds worst-case latency and cost.
  - Tradeoff: Loses the SDK's automatic backoff on 429/5xx — a transient error now uses up one of the two attempts.
  - Confidence: HIGH — SDK defaults verified in node_modules/@anthropic-ai/sdk client.js.
  - Blind spot: 60 s vs. real p99 latency at effort "low" not measured (one data point: 8.2 s).
- **Decision**: FIXED — client uses maxRetries: 0 and a 60 s timeout (client.ts)

### F2 — Error log includes the upstream response body

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/coaching/getCoachingSuggestion.ts:90-92
- **Detail**: `console.error` logs `error.message`; SDK `APIError` messages embed the upstream body (seen in `wrangler tail`: `400 {"type":"error",...}`). Logs only; nothing reaches the response.
- **Fix**: Log `error.name`, `status` and `request_id` instead of the full message (keep the stop-reason / request-id lines as they are).
- **Decision**: FIXED — errors logged as class, status and request id only

### F3 — Unplanned changes: eslint.config.js and a 500 guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js (`.claude/` ignore, commit 6e26b2f); src/pages/api/coaching/try.ts:61-65
- **Detail**: Both are benign: the ESLint ignore fixed CI after course tooling was committed; the try/catch returns a generic 500 JSON. Neither is described in the plan.
- **Fix**: Add a short addendum to plan.md recording both as accepted additions.
- **Decision**: FIXED — addendum added to plan.md

### F4 — Manual row 2.5 checked with its 403 half unverified

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 2.5
- **Detail**: 2.5 is `[x]`, but the non-allowlisted 403 check was skipped by the user (recorded in change.md). No observable evidence in the diff for that half.
- **Fix**: Keep as is (documented), or add a unit test for the allowlist parsing so the 403 path has automated evidence.
- **Decision**: FIXED — allowlist extracted to allowlist.ts with 5 unit tests (403 path covered)

### F5 — User text goes to the model unvalidated and unfenced (relevant for S-02)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/coaching/getCoachingSuggestion.ts:54
- **Detail**: `comment`, `goal` and `notes` enter the user message without length limits or delimiting. No exposure today (fixed sample input), but S-02 will pass real user input.
- **Fix**: In S-02, validate input with zod (`.max()` limits) and wrap user text in delimiters with an instruction to treat it as data.
- **Decision**: FIXED + ACCEPTED-AS-RULE: User text sent to the model must be validated and fenced — CoachingInputSchema limits, InvalidCoachingInputError, tagged user text, 2 new tests
