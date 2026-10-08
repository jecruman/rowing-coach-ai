<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Rower Profile and Goals Implementation Plan

- **Plan**: context/changes/rower-profile-and-goals/plan.md
- **Mode**: Deep
- **Date**: 2026-10-08
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
8/8 paths ✓, 4/4 symbols ✓ (`supabase` CLI devDependency, `PROTECTED_ROUTES`, `enable_signup`, smoke `supabase.env`), brief↔plan ✓, Progress 17/17 ✓ (18/18 after fixes).

## Findings

### F1 — Supabase rows are typed `any`; strict lint will reject them

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §3–4, Phase 3 §2, §4
- **Detail**: `createServerClient` defaults `Database = any` (`@supabase/ssr` `createServerClient.d.ts:8`); a tsc probe showed select/upsert `data` is `any[]`, which fails `no-unsafe-*` under strictTypeChecked.
- **Fix A ⭐ Recommended**: Generated database types (`supabase gen types typescript --linked`) + `<Database>` generic
  - Strength: Typed rows now and for later slices; documented Supabase pattern; CLI verified.
  - Tradeoff: Regenerate after each migration.
  - Confidence: HIGH — command and generic verified in installed packages.
  - Blind spot: Generated file may need lint/format ignores.
- **Fix B**: Parse rows with hand-written zod schemas
  - Strength: No generated file.
  - Tradeoff: Row schemas drift from the migration.
  - Confidence: MED.
  - Blind spot: Insert params stay untyped.
- **Decision**: FIXED (Fix A) — Phase 1 §5 and criterion 1.4 added

### F2 — updated_at left as "implementer's choice"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1
- **Detail**: First table sets the pattern; two mechanisms left open.
- **Fix**: `public.set_updated_at()` trigger on both tables; app never sets it.
- **Decision**: FIXED

### F3 — Criterion 1.1 needs Docker locally

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress 1.1
- **Detail**: `npx supabase db reset` needs Docker; CI's `supabase start` is the realistic check.
- **Fix**: 1.1 = migration applies in the CI smoke job; local reset optional.
- **Decision**: FIXED

### F4 — Time precision can disagree with the column

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2
- **Detail**: `target_seconds numeric(7,1)` would silently round `"1:55.55"`.
- **Fix**: `parseTime` accepts at most one decimal digit; test case added.
- **Decision**: FIXED

### F5 — SessionType defined twice

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §1
- **Detail**: "Re-export or same union" allowed a second definition that could drift.
- **Fix**: `src/types.ts` re-exports `SessionType` from the coaching schema.
- **Decision**: FIXED

### F6 — rls-check sign-up rate limits

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2
- **Detail**: Two sign-ups per run is well below local Auth limits.
- **Fix**: None needed.
- **Decision**: DISMISSED
