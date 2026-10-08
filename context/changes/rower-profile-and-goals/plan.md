# Rower Profile and Goals Implementation Plan

## Overview

Let a signed-in rower set a profile (birth year, weight, boat) and at most one erg goal and one water goal (distance, target time, optional event date) on a protected `/profile` page. This is roadmap slice S-01 (`rower-profile-and-goals`, Linear JES-12; FR-001, FR-002, FR-003) and the first slice that stores per-user data, so it also establishes the access-rule (RLS) pattern every later table follows and proves it in CI. S-02 (`first-session-suggestion`) consumes the profile and goals.

## Current State Analysis

- Sign-in (FR-001) works end to end: Supabase email/password with cookie sessions; `src/middleware.ts:4` protects only `/dashboard`; sign-up, sign-in and the dashboard were verified on the deployed Worker.
- Supabase is reached through `createClient` (`src/lib/supabase.ts`) with the user's cookies and the anon key, so database calls run as the signed-in user and RLS applies; the app never uses a service-role key.
- No database schema exists: no `supabase/migrations/` folder, no `src/types.ts`, no `src/lib/services/profile`. AGENTS.md requires RLS with per-operation, per-role policies on every new table and migration files named `YYYYMMDDHHmmss_short_description.sql`.
- Form pattern: React form components (`src/components/auth/SignInForm.tsx`) post to `src/pages/api/**` handlers that redirect back with `?error=` (`src/pages/api/auth/signin.ts`). `src/pages/dashboard.astro` is still the starter placeholder.
- CI: the `smoke` job starts a fresh local Supabase (which applies `supabase/migrations/`), writes its `API_URL` / `ANON_KEY` to `supabase.env`, builds, and runs `scripts/smoke.mjs` against the preview. Local `supabase/config.toml` has email confirmations off, so sign-up returns a session immediately.
- Production schema changes are not automated: nothing applies migrations to the cloud project `gcmqjephpevbqfnnqgkx`.

## Desired End State

A signed-in rower opens `/profile`, saves birth year, weight and boat, and sets, replaces or clears one erg goal and one water goal; values persist and are shown back (goal time as m:ss with derived pace per 500 m). The dashboard prompts to set up the profile when it is empty, otherwise shows a short summary with a link. Anonymous visitors to `/profile` are redirected to sign-in. In CI, a check proves one user cannot read, insert, update or delete another user's profile or goals. The schema is live on the cloud project.

### Key Discoveries:

- RLS applies automatically because requests carry the user's session: `src/lib/supabase.ts` (`createServerClient` with request cookies).
- Endpoint + redirect-with-error pattern: `src/pages/api/auth/signin.ts`.
- Route protection list: `src/middleware.ts:4` (`PROTECTED_ROUTES`).
- CI already exposes the local Supabase URL and anon key to the smoke job via `supabase.env` (`.github/workflows/ci.yml`, smoke job).

## What We're NOT Doing

- No goal history — changing a goal replaces it; clearing deletes it.
- No forced onboarding redirect; the dashboard only prompts.
- No pace-only goals — a goal is always distance + target time; pace per 500 m is derived for display.
- No session logging, metrics or suggestions (S-02), no coach view or sharing.
- No automatic migration in CI/CD — the user applies migrations to production with `supabase db push`.
- No Playwright/browser tests.
- No profile picture, name or other fields beyond birth year, weight and boat.

## Implementation Approach

Schema first, with the privacy guarantee proven in CI before any UI exists; then pure input rules and save endpoints with unit tests; then the page. All writes go through server endpoints that validate with zod and call Supabase as the signed-in user, so RLS is the last line of defence even if an endpoint has a bug.

## Critical Implementation Details

- **Order of deploy vs. schema:** the user must run `supabase db push` before (or immediately after) the Phase 2/3 code reaches production; code that reads missing tables fails. Phase 1 lands the migration and the push; later phases only deploy code.
- **Upsert keys:** `profiles` uses `user_id` as primary key and `goals` has a unique `(user_id, session_type)`, so saves are upserts on those keys — never "insert another row".

## Phase 1: Schema, access rules and privacy check

### Overview

Create the `profiles` and `goals` tables with per-operation RLS, prove in CI that users are isolated, and apply the schema to the cloud project.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_profiles_and_goals.sql`

**Intent**: Add the first per-user tables with constraints that encode the decided rules, so bad data can't be stored even if app validation is bypassed.

**Contract**:
- `profiles`: `user_id uuid primary key references auth.users(id) on delete cascade default auth.uid()`, `birth_year int` (check 1900 – current year), `weight_kg numeric(5,1)` (check 30 – 200), `boat text` (check in `'1x','2x','2-','4x','4-','8+'`), `created_at`, `updated_at` (timestamptz, default now()). Fields nullable so a partial profile can be saved.
- `goals`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade default auth.uid()`, `session_type text not null` (check in `'erg','water'`), `distance_m int not null` (check 100 – 100000), `target_seconds numeric(7,1) not null` (check > 0), `event_date date null`, `created_at`, `updated_at`; `unique (user_id, session_type)`.
- RLS enabled on both. For role `authenticated`, one policy each for `select`, `insert`, `update`, `delete`, all with `user_id = auth.uid()` (`using` and, for insert/update, `with check`). No policies for `anon`.
- `updated_at` maintained by a `public.set_updated_at()` trigger function (before update, for each row) attached to both tables; the app never sets it. This is the pattern for all later tables.

#### 2. Cross-user access check

**File**: `scripts/rls-check.mjs`

**Intent**: Prove the privacy guardrail on a real database: user B can never see or change user A's rows.

**Contract**: dependency-free Node script (same style as `scripts/smoke.mjs`) reading `SUPABASE_URL` and `SUPABASE_KEY` (anon key). Signs up two fresh users via the Auth REST API (`/auth/v1/signup`, confirmations off locally), then via PostgREST (`/rest/v1/...` with each user's access token): A inserts a profile and an erg goal; B's `select` on both tables returns none of A's rows; B's update and delete of A's rows affect 0 rows (A's data unchanged on re-read); B's insert with `user_id` = A's id is rejected; an anonymous `select` returns no rows. Prints PASS/FAIL per step and exits non-zero on any failure. Exposed as `npm run rls-check`.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Run the access check on every push and PR, against the local Supabase the smoke job already starts.

**Contract**: smoke job gains a step after "Start local Supabase" that sources `supabase.env` and runs `SUPABASE_URL=$API_URL SUPABASE_KEY=$ANON_KEY npm run rls-check`.

#### 4. Production schema (user action)

**File**: — (cloud project `gcmqjephpevbqfnnqgkx`)

**Intent**: Apply the migration to production with tracked history.

**Contract**: user runs `npx supabase link --project-ref gcmqjephpevbqfnnqgkx` once (enters the database password; nothing is stored in the repo), then `npx supabase db push`. `supabase/.temp/` stays gitignored.

#### 5. Generated database types

**File**: `src/db/database.types.ts`, `src/lib/supabase.ts`

**Intent**: Without a `Database` generic, `createServerClient` types every row as `any` (`@supabase/ssr` `createServerClient.d.ts:8`), which the strict lint rules reject; generated types make every query typed for this and later slices.

**Contract**: after `db push`, run `npx supabase gen types typescript --linked > src/db/database.types.ts` (no Docker needed) and commit the file; rerun after every future migration. `src/lib/supabase.ts` passes `<Database>` to `createServerClient`. If the generated file trips lint/format rules, add it to the ESLint ignores and `.prettierignore` (generated code is not hand-edited).

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh database in the CI smoke job (`supabase start`); local `npx supabase db reset` optional, needs Docker
- Access check passes in CI: smoke job step `npm run rls-check`
- Existing checks still pass: `npm test`, `npm run lint`, `npx astro check`
- Database types generated and committed: `src/db/database.types.ts` exists and `npx astro check` passes with `<Database>` in `src/lib/supabase.ts`

#### Manual Verification:

- `npx supabase db push` applied the migration to the cloud project; both tables show "RLS enabled" in the Supabase dashboard (Table Editor)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Input rules and save endpoints

### Overview

Add the validation and time logic as pure, tested functions, and the two endpoints that save profile and goals as the signed-in user.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: One place for the entity and DTO types used by endpoints and pages (per AGENTS.md).

**Contract**: `Boat` (`'1x' | '2x' | '2-' | '4x' | '4-' | '8+'`), `SessionType` (re-exported from `src/lib/services/coaching/schema.ts` — one definition, no second union), `RowerProfile` (`birthYear`, `weightKg`, `boat`, all nullable), `RowerGoal` (`sessionType`, `distanceM`, `targetSeconds`, `eventDate | null`).

#### 2. Input rules and time helpers

**File**: `src/lib/services/profile/rules.ts`

**Intent**: Validate form input and convert between typed times and seconds, so endpoints stay thin and the logic is unit-tested.

**Contract**:
- `parseTime(text) => number | null`: accepts `m:ss`, `m:ss.d`, `h:mm:ss` (e.g. `"3:50"` → 230, `"1:55.5"` → 115.5, `"1:02:30"` → 3750); rejects seconds ≥ 60, more than one decimal digit (`"1:55.55"` — the column is `numeric(7,1)`), empty or non-numeric input.
- `formatTime(seconds) => string`: inverse for display (`230` → `"3:50"`, `115.5` → `"1:55.5"`, `3750` → `"1:02:30"`).
- `pacePer500(distanceM, targetSeconds) => number`: `targetSeconds * 500 / distanceM` (`1000 m` in `230 s` → `115` → `"1:55"`).
- zod `ProfileInputSchema` (form strings → `birthYear` int 1900–current year, `weightKg` 30–200 with one decimal, `boat` in the fixed list; each optional/empty → null) and `GoalInputSchema` (`sessionType` erg|water, `distanceM` int 100–100000, `targetTime` parsed with `parseTime`, `eventDate` optional valid ISO date — past dates allowed so an old goal never blocks other edits), plus an `action` field `save | clear` for goals.

#### 3. Profile endpoint

**File**: `src/pages/api/profile.ts`

**Intent**: Create or update the signed-in rower's profile.

**Contract**: `POST`, `prerender = false`. Not signed in → redirect `/auth/signin`. Parses form data with `ProfileInputSchema`; invalid → redirect `/profile?error=<message>`. Valid → upsert `profiles` on `user_id` (as the signed-in user) → redirect `/profile?saved=profile`. Supabase error → redirect `/profile?error=…` (generic message, details only in logs).

#### 4. Goals endpoint

**File**: `src/pages/api/goals.ts`

**Intent**: Create, replace or clear the signed-in rower's goal for one session type.

**Contract**: `POST`, `prerender = false`. Same auth and error redirects as the profile endpoint. `action=save` → validate with `GoalInputSchema` → upsert `goals` on `(user_id, session_type)` → redirect `/profile?saved=<type>-goal`. `action=clear` → delete the user's goal of that type (deleting a missing goal is not an error) → redirect `/profile?saved=<type>-goal`.

#### 5. Unit tests

**File**: `src/lib/services/profile/rules.test.ts`

**Intent**: Lock the parsing and validation rules S-02 will rely on.

**Contract**: cases — `parseTime` valid formats and rejections (`"3:60"`, `"abc"`, `""`, `"-1:00"`, `"1:55.55"`); `formatTime` round-trips; `pacePer500(1000, 230)` = 115 and formats to `"1:55"`; `ProfileInputSchema` accepts a full and an empty profile, rejects birth year 1800 / future year, weight 20 / 250, boat `"canoe"`; `GoalInputSchema` accepts `erg / 2000 / "7:30"`, rejects distance 50, time `"7:75"`, type `"bike"`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes with 0 real problems: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Reviewer confirms the time format and limits (birth year 1900–now, weight 30–200 kg, distance 100–100 000 m) match how the rower enters data

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Profile page and dashboard link

### Overview

Give the rower a protected `/profile` page to view and edit everything, and turn the placeholder dashboard into an entry point.

### Changes Required:

#### 1. Route protection

**File**: `src/middleware.ts`

**Intent**: Keep anonymous visitors out of `/profile`.

**Contract**: `PROTECTED_ROUTES` gains `"/profile"`.

#### 2. Profile page

**File**: `src/pages/profile.astro`

**Intent**: Show and edit the profile and both goals in one place, prefilled from the database.

**Contract**: server-renders the signed-in user's `profiles` row and `goals` rows (as that user). Shows `?error=` / `?saved=` messages. Contains the profile form (posts to `/api/profile`) and one goal form per session type (posts to `/api/goals` with `sessionType`, `action=save`, and a "Clear goal" button with `action=clear`). Goal time is shown as m:ss via `formatTime`, with the derived pace per 500 m when a goal exists. Current age is shown computed from birth year.

#### 3. Form components

**File**: `src/components/profile/ProfileForm.tsx`, `src/components/profile/GoalForm.tsx`

**Intent**: Interactive forms with field-level validation, following `SignInForm.tsx` (reuse `FormField`, `SubmitButton`, `ServerError` from `src/components/auth/`).

**Contract**: `ProfileForm` props: current profile values; fields birth year, weight (kg), boat (select with the fixed list). `GoalForm` props: `sessionType`, current goal or null; fields distance (m), target time (text, e.g. `3:50`), optional event date; client-side checks mirror `rules.ts` (reuse its functions), server stays authoritative.

#### 4. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Point the rower to their setup.

**Contract**: reads the user's profile and goals; when there is no profile row or no goal, shows "Set up your profile and goals" linking to `/profile`; otherwise a one-line summary (boat, age, each goal as distance + m:ss) and an "Edit profile" link. Sign-out stays.

#### 5. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Keep the end-to-end flow covered on the production build.

**Contract**: add steps — anonymous `/profile` → `302 /auth/signin`; after sign-in, `/profile` → 200; `POST /api/profile` with valid form → `302 /profile?saved=profile`; `POST /api/goals` (erg, 2000, `7:30`, save) → `302 /profile?saved=erg-goal`; `POST /api/goals` with time `"7:75"` → `302 /profile?error=`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`
- Smoke test passes in CI, including the new profile/goal steps: `smoke` job
- Anonymous `/profile` redirects on the deployed Worker: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://rowing-coach-ai.jecruman.workers.dev/profile` → `302 …/auth/signin`

#### Manual Verification:

- On the deployed app, the rower saves a profile and an erg and a water goal, reloads, and sees the values (goal time as m:ss with pace /500 m)
- Replacing a goal overwrites it; "Clear goal" removes it
- Dashboard shows the setup prompt for a new account and the summary once filled
- Forms are comfortable on a phone screen (PRD NFR)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `rules.test.ts`: time parsing/formatting, pace derivation, profile and goal input limits.

### Integration Tests:

- `scripts/rls-check.mjs` (CI smoke job): two users, cross-user select/insert/update/delete denied, anonymous select empty.
- `scripts/smoke.mjs` (CI smoke job): profile page protection, saving profile and goal, rejected invalid time.

### Manual Testing Steps:

1. Sign in on the deployed app; dashboard shows "Set up your profile and goals".
2. On `/profile`, save birth year 1984, weight 70, boat 1x; reload — values shown, age 42.
3. Save water goal 1000 m / 3:50; it shows pace 1:55 /500 m.
4. Change it to 3:45; reload — only the new goal exists. Clear it — gone.
5. Check the page on a phone.

## Performance Considerations

Each page load adds two small queries (profile, goals) for the signed-in user; no new CPU-heavy work on the Worker.

## Migration Notes

First migration in the project. Applied locally by `supabase start`/`db reset` and in CI automatically; applied to production by the user with `npx supabase db push` after `npx supabase link --project-ref gcmqjephpevbqfnnqgkx`. Rollback is a new forward migration (drop tables); there is no existing data to preserve.

## References

- Roadmap item: `context/foundation/roadmap.md` → S-01 (Linear JES-12)
- PRD: FR-001, FR-002, FR-003; Access Control; Guardrail "privacy between users"
- Patterns: `src/lib/supabase.ts`, `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`, `src/middleware.ts:4`, `scripts/smoke.mjs`
- Lessons: `context/foundation/lessons.md` (model-input rule — not applicable here; no model calls in this slice)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, access rules and privacy check

#### Automated

- [ ] 1.1 Migration applies on a fresh database in the CI smoke job (`supabase start`); local `npx supabase db reset` optional, needs Docker
- [ ] 1.2 Access check passes in CI: smoke job step `npm run rls-check`
- [x] 1.3 Existing checks still pass: `npm test`, `npm run lint`, `npx astro check`
- [x] 1.4 Database types generated and committed: `src/db/database.types.ts` exists and `npx astro check` passes with `<Database>` in `src/lib/supabase.ts`

#### Manual

- [x] 1.5 `npx supabase db push` applied the migration to the cloud project; both tables show "RLS enabled" in the Supabase dashboard (Table Editor)

### Phase 2: Input rules and save endpoints

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Lint passes with 0 real problems: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 Build passes: `npm run build`

#### Manual

- [ ] 2.5 Reviewer confirms the time format and limits (birth year 1900–now, weight 30–200 kg, distance 100–100 000 m) match how the rower enters data

### Phase 3: Profile page and dashboard link

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Lint and type check pass: `npm run lint`, `npx astro check`
- [ ] 3.3 Smoke test passes in CI, including the new profile/goal steps: `smoke` job
- [ ] 3.4 Anonymous `/profile` redirects on the deployed Worker: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://rowing-coach-ai.jecruman.workers.dev/profile` → `302 …/auth/signin`

#### Manual

- [ ] 3.5 On the deployed app, the rower saves a profile and an erg and a water goal, reloads, and sees the values (goal time as m:ss with pace /500 m)
- [ ] 3.6 Replacing a goal overwrites it; "Clear goal" removes it
- [ ] 3.7 Dashboard shows the setup prompt for a new account and the summary once filled
- [ ] 3.8 Forms are comfortable on a phone screen (PRD NFR)
