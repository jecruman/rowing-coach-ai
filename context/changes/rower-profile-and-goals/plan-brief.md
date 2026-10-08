# Rower Profile and Goals — Plan Brief

> Full plan: `context/changes/rower-profile-and-goals/plan.md`

## What & Why

Roadmap slice S-01 (FR-001–003, Linear JES-12): a signed-in rower sets a profile (birth year, weight, boat) and at most one erg goal and one water goal (distance, target time, optional event date). It is the first slice that stores per-user data, so it sets — and proves in CI — the access-rule pattern every later table follows (PRD guardrail: privacy between users). S-02 reads the profile and goals.

## Starting Point

Sign-in works and is verified on the live Worker; Supabase is called as the signed-in user, so database access rules (RLS) apply automatically. There is no schema yet, no migrations folder, and nothing applies migrations to the cloud project. The dashboard is still the starter placeholder.

## Desired End State

On a protected `/profile` page the rower saves profile values and sets, replaces or clears each goal; goal time shows as m:ss with derived pace per 500 m. The dashboard prompts "Set up your profile and goals" until filled, then shows a summary. A CI check proves one user can't read, insert, update or delete another's rows. The schema is live on the cloud project.

## Key Decisions Made

| Decision            | Choice                                                     | Why (1 sentence) |
| ------------------- | ---------------------------------------------------------- | ---------------- |
| Goal target         | Distance (m) + target time (s); pace /500 m derived        | Matches how goals are stated ("3:50 for 1000 m"); one source of truth. |
| Changing a goal     | Replace in place; clear deletes; unique per user + type    | Simplest model that satisfies "at most one erg and one water goal". |
| Boat                | Fixed list: 1x, 2x, 2-, 4x, 4-, 8+                         | Clean data S-02's rules can rely on. |
| Age                 | Birth year stored; age computed                            | Never goes stale. |
| Pages               | One protected `/profile` page; dashboard prompts, no forced onboarding | Small change; dashboard stays free for S-02. |
| Migrations to prod  | User runs `supabase link` + `supabase db push`             | Same files CI tests; no production DB credentials in GitHub. |
| Typed queries       | Generated `src/db/database.types.ts` (`supabase gen types --linked`) + `<Database>` generic | Untyped Supabase rows are `any` and fail the strict lint rules; regenerate after each migration. |
| `updated_at`        | `set_updated_at()` trigger on both tables                  | One pattern for every later table; the app never sets it. |
| Testing             | Vitest for rules + `rls-check` script in CI smoke job + extended smoke steps | Proves the privacy guardrail on a real database on every push. |

## Scope

**In scope:** `profiles` and `goals` tables with per-operation RLS and an `updated_at` trigger; generated database types; cross-user access check in CI; zod input rules and time helpers with unit tests; `POST /api/profile`, `POST /api/goals`; `/profile` page, form components, dashboard prompt/summary; smoke steps; production `db push`.

**Out of scope:** goal history, forced onboarding, pace-only goals, sessions/metrics/suggestions (S-02), coach view, automatic migrations in CI/CD, browser E2E tests, extra profile fields.

## Architecture / Approach

Form (React) → `POST /api/profile` or `/api/goals` → zod validation → Supabase upsert/delete as the signed-in user → RLS allows only own rows → redirect back to `/profile` with `saved`/`error`. `/profile` and the dashboard read the user's rows server-side.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema, access rules and privacy check | Migration with RLS, `rls-check` in CI, schema pushed to cloud, generated DB types | A policy gap that leaks or blocks rows — the CI check exists to catch it |
| 2. Input rules and save endpoints | Time parsing, validation, save/clear endpoints, unit tests | Time-format edge cases (seconds ≥ 60, hours) |
| 3. Profile page and dashboard link | `/profile` UI, dashboard prompt/summary, smoke steps | Deploying code before `db push` breaks the page |

**Prerequisites:** Docker for local `supabase db reset` (optional; CI covers it); the cloud project's database password for `supabase link`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Production schema depends on a manual `db push`; it must run before Phase 2/3 code goes live.
- Local email confirmations are off (CI relies on it); production settings are unchanged.

## Success Criteria (Summary)

- A rower sets and edits profile and goals on the live app; values persist and display correctly.
- CI proves on every push that users can't see or change each other's data.
- Anonymous visitors can't open `/profile`.
