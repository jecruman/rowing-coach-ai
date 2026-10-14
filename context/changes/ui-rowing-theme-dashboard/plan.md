# Rowing theme tokens and a token-built dashboard — Implementation Plan

## Overview

Give the starter's unused shadcn token system a rowing identity ("Erg & Water", dark-first), rebuild
`/dashboard` from those tokens and repo components, fix the entry points around it (post-sign-in
redirect, one shared navigation on every signed-in page), prove the dashboard's 7-state matrix on a
dev-only kitchen sink, and leave a rule plus a lint check so the next view keeps the contract.

Run under `/10x-ui`. Charges C1–C5 come from `context/changes/ui-rowing-theme-dashboard/research.md`
(`## Charges`).

## Current State Analysis

- Token system is set up correctly but dead: `:root`/`.dark` neutral values (`src/styles/global.css:6-73`)
  published through `@theme inline` (`:75-111`); 0 semantic-token class usages across 35 view files.
- Every page paints itself with `@utility bg-cosmic` (`global.css:113-115`, raw hex) and palette
  classes; `.dark` is never applied (`src/layouts/Layout.astro:14`).
- Dashboard (`src/pages/dashboard.astro:39-95`): lone centred glass card, hand-rolled purple `<a>`
  buttons (`:55`, `:69`), purple links, own sign-out (`:85-92`), no `Topbar`, no focus-visible styles,
  no empty state, latest-session load failure silently hidden (`:20-21`).
- `ServerError` (`src/components/auth/ServerError.tsx:11`) uses red literals and no `role="alert"`.
- Sign-in redirects to the starter landing (`src/pages/api/auth/signin.ts:19`); the smoke test pins
  that (`scripts/smoke.mjs:93`).
- Six signed-in pages share one wrapper shape with `<Topbar />` as first child
  (e.g. `src/pages/profile.astro:40-42`); `Topbar` (`src/components/Topbar.astro`) links only
  Dashboard + Sign out. `Welcome.astro:2` (landing) also imports it.
- `src/components/ui` has `button.tsx` (variants default/destructive/outline/secondary/ghost/link,
  `asChild`, focus ring — `:7-33`) and an unused `LibBadge.astro`. `buttonVariants` is exported (`:50`).
- Agent rules: `AGENTS.md:21`, `:28` silent on tokens; `CLAUDE.md` is entirely the
  `@przeprogramowani/10x-cli` managed block. No screenshot tooling in the repo.

## Desired End State

- Every page renders on navy-water dark tokens; the dashboard reads **only** tokens and repo
  components (scan count 0 on its files).
- After sign-in the rower lands on `/dashboard`; every signed-in page shows the same navigation
  (Dashboard, Sessions, Trends, Profile, Sign out) with the current page marked.
- The dashboard shows a real empty state, an inline error when the latest session cannot load, a
  visible teal focus ring on every control, and fits a 390 px phone.
- `/dev/kitchen-sink` (dev builds only) shows all 7 states; screenshots at 1280 px and 390 px live in
  the change folder.
- `AGENTS.md` carries a UI rule block; `npm run lint` fails if a literal colour or arbitrary value
  appears in an allowlisted (cleaned) file.

### Key Discoveries:

- `buttonVariants()` can style `<a>` in `.astro` without a React island (`src/components/ui/button.tsx:50`).
- shadcn's `outline` and `ghost` variants use `--accent` as their **hover background**
  (`button.tsx:16`, `:18`) — the buoy-orange suggestion colour cannot live in `--accent`.
- `bg-cosmic` has 11 usages; deleting it breaks 10 unmigrated pages that draw white text on it.
- The smoke suite pins the post-sign-in location (`scripts/smoke.mjs:93`) and already tests
  anonymous redirects (`:75-79`).

## What We're NOT Doing

- Restyling page bodies other than the dashboard (sessions list/detail/new/edit, trend, profile,
  auth pages) — they only get the new nav and the token background. Follow-up per-view changes.
- The landing page (`Welcome.astro`) — its own change, `ui-landing-page`; it keeps `Topbar`.
- A theme toggle or `prefers-color-scheme` switching — light `:root` values are defined, not shipped.
- Adding a font or any font dependency — system stack plus `tabular-nums`.
- Return-to after sign-in (`src/middleware.ts:20`), `Banner.astro` hex colours and Polish copy — deferred
  (see research `### Candidates for deferral`).
- Chart and sidebar tokens — unchanged.
- Installing Playwright/Storybook or any screenshot-test dependency.
- Deleting `Topbar.astro` or `LibBadge.astro`.

## Implementation Approach

Follow the `/10x-ui` order: environment/library → token values → view → states, with the shared
navigation between tokens and view (the view sits inside it) and the guard last. Re-point rather than
delete `bg-cosmic` so unmigrated pages stay legible on the new dark background. Split the dashboard
into a data-loading page and a presentational `DashboardView.astro` so the kitchen sink can render
every state from fixtures without Supabase.

## Critical Implementation Details

- **Accent vs coach colour.** Keep `--accent` a subtle navy/teal tint (it is the hover background of
  `outline`/`ghost` buttons). The buoy-orange suggestion colour gets its own role pair,
  `--coach` / `--coach-foreground`, published through `@theme inline` like every other token.
- **Values in `:root`/`.dark`, never in `@theme inline`.** `@theme inline` only maps `--color-*` to
  `var(--*)`; raw colours there break theme switching.
- **Kitchen sink must 404 in production builds**, guarded by `import.meta.env.DEV` at the top of the
  page frontmatter (return a 404 response), not by hiding links.

## Phase 1: Environment and entry points

### Overview

Add the missing library component, switch the app to the dark token layer, and fix the entry-point
architecture items that do not depend on new colours (C4 partial).

### Changes Required:

#### 1. Card component

**File**: `src/components/ui/card.tsx` (new, via `npx shadcn@latest add card`)

**Intent**: Add shadcn's Card so the dashboard stops hand-rolling glass cards (C2).

**Contract**: Generated by the shadcn CLI against `components.json` (new-york, neutral, `@/components/ui`);
no edits to `global.css` from the CLI are kept if it tries to rewrite tokens.

#### 2. Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Apply the dark token layer app-wide, fix the mobile viewport and the starter title.

**Contract**: `<html lang="en" class="dark">`; viewport `width=device-width, initial-scale=1`; default
title "Rowing Coach AI"; page titles render as "<title> · Rowing Coach AI" when a title is passed.

#### 3. bg-cosmic

**File**: `src/styles/global.css`

**Intent**: Keep the utility (11 usages) but build it from tokens so every unmigrated page moves to
the new palette and stays legible.

**Contract**: `@utility bg-cosmic` uses only `var(--background)` / `var(--card)` (no hex); a source
comment marks it as a migration shim to delete once no view uses it.

#### 4. Post-sign-in redirect

**File**: `src/pages/api/auth/signin.ts`, `scripts/smoke.mjs`

**Intent**: Land rowers on their dashboard, not the marketing page (C4).

**Contract**: successful sign-in → `302 /dashboard`; smoke case "signin accepts correct password"
expects `location: "/dashboard"`. Sign-out stays `302 /`.

### Success Criteria:

#### Automated Verification:

- `src/components/ui/card.tsx` exists and is the only new file under `src/components/ui`
- `npm run lint` passes
- `npx astro check` passes
- `npm test` passes
- `npm run build` succeeds
- `grep -E '#[0-9a-fA-F]{3,8}' ` finds no hex inside the `bg-cosmic` block of `src/styles/global.css`
- `npm run smoke` passes against the preview build, including sign-in → `/dashboard`

#### Manual Verification:

- Signing in lands on `/dashboard`
- Unmigrated pages (sessions list, profile, sign-in) are still legible on the new background

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Token values — Erg & Water

### Overview

Replace the neutral values with the rowing palette, add the missing role tokens, and deposit the raw
values in the change folder (C1, C3 token side).

### Changes Required:

#### 1. Token values

**File**: `src/styles/global.css`

**Intent**: Give the existing roles rowing values in both themes; add `--coach`, `--coach-foreground`
and `--destructive-foreground`, published via `@theme inline`.

**Contract**: Starting values below (oklch). Phase 5's contrast check may adjust lightness; any
adjustment is recorded in `tokens.md`. A one-line comment above `:root` names the source
(`context/changes/ui-rowing-theme-dashboard/tokens.md`). Chart and sidebar tokens unchanged.

| Role | `.dark` (shipped) | `:root` (defined, not shipped) |
|---|---|---|
| background | `oklch(0.17 0.03 245)` | `oklch(0.985 0.005 220)` |
| foreground | `oklch(0.96 0.01 230)` | `oklch(0.21 0.04 245)` |
| card / popover | `oklch(0.22 0.035 245)` | `oklch(1 0 0)` |
| primary (river-teal) | `oklch(0.72 0.12 195)` | `oklch(0.50 0.10 200)` |
| primary-foreground | `oklch(0.18 0.03 245)` | `oklch(0.99 0 0)` |
| secondary | `oklch(0.28 0.035 245)` | `oklch(0.95 0.01 220)` |
| muted | `oklch(0.26 0.03 245)` | `oklch(0.955 0.01 220)` |
| muted-foreground | `oklch(0.72 0.03 235)` | `oklch(0.48 0.03 240)` |
| accent (hover tint) | `oklch(0.30 0.04 220)` | `oklch(0.94 0.02 200)` |
| destructive | `oklch(0.70 0.19 25)` | `oklch(0.577 0.245 27.325)` |
| destructive-foreground | `oklch(0.98 0 0)` | `oklch(0.98 0 0)` |
| border | `oklch(1 0 0 / 12%)` | `oklch(0.90 0.01 230)` |
| input | `oklch(1 0 0 / 16%)` | `oklch(0.90 0.01 230)` |
| ring (teal) | `oklch(0.78 0.13 195)` | `oklch(0.55 0.10 200)` |
| coach (buoy-orange) | `oklch(0.78 0.16 60)` | `oklch(0.70 0.17 55)` |
| coach-foreground | `oklch(0.20 0.04 50)` | `oklch(0.22 0.05 45)` |

#### 2. Token deposit

**File**: `context/changes/ui-rowing-theme-dashboard/tokens.md` (new)

**Intent**: Keep the values and their rationale outside the chat so the next session does not invent
new ones.

**Contract**: The table above, the motif description (river-teal primary, buoy-orange reserved for the
coach's suggestion, navy-water surfaces), the accent-vs-coach rule, and a contrast log filled in Phase 5.

### Success Criteria:

#### Automated Verification:

- `@theme inline` contains no raw colour values (only `var()` / `calc()`)
- `--color-coach`, `--color-coach-foreground` and `--color-destructive-foreground` are published in `@theme inline`
- `npm run lint`, `npx astro check` and `npm run build` pass
- `context/changes/ui-rowing-theme-dashboard/tokens.md` exists with both theme columns

#### Manual Verification:

- All pages show navy surfaces; shadcn buttons already in use (auth submit, suggestion panel, delete) render teal/destructive from tokens
- Hovering an `outline`/`ghost` button shows a subtle tint, not orange

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: Shared navigation

### Overview

One token-built navigation for every signed-in page, replacing `Topbar` there (C4).

### Changes Required:

#### 1. AppNav component

**File**: `src/components/AppNav.astro` (new)

**Intent**: The single signed-in header: brand mark "Rowing Coach AI" linking to `/dashboard`, links
Dashboard, Sessions, Trends, Profile, and a Sign out form posting to `/api/auth/signout`.

**Contract**: Prop `current: "dashboard" | "sessions" | "trend" | "profile" | null`; renders `<nav
aria-label="Main">`; the current link has `aria-current="page"` and a token-driven selected style;
links and sign-out use `buttonVariants` (`ghost`/`link`) so focus-visible comes from `--ring`; fits a
390 px viewport without horizontal scroll (wraps or compacts). Tokens and repo components only.

#### 2. Signed-in pages

**File**: `src/pages/profile.astro`, `src/pages/sessions/index.astro`, `src/pages/sessions/new.astro`,
`src/pages/sessions/[id].astro`, `src/pages/sessions/[id]/edit.astro`, `src/pages/sessions/trend.astro`

**Intent**: Swap `<Topbar />` for `<AppNav current=…/>`; page bodies untouched.

**Contract**: `sessions/index`, `[id]`, `[id]/edit`, `new` → `current="sessions"`; `trend` →
`"trend"`; `profile` → `"profile"`. No `Topbar` import remains in `src/pages`. `Welcome.astro` keeps `Topbar`.

### Success Criteria:

#### Automated Verification:

- `grep -rn "Topbar" src/pages` returns no hits
- `src/components/AppNav.astro` returns 0 hits from the hardcoded-value scan
- `npm run lint`, `npx astro check`, `npm test` and `npm run build` pass
- `npm run smoke` passes

#### Manual Verification:

- On each of the 6 pages the nav shows the right current item, and Trends/Profile are reachable from every one
- Tabbing through the nav shows a teal focus ring on each link and on Sign out
- At 390 px the nav fits without horizontal scrolling

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: Dashboard view

### Overview

Rebuild the dashboard from tokens, `Card`, `buttonVariants` and `AppNav`, and give it the missing
empty and error states (C1, C2, C3, C4).

### Changes Required:

#### 1. DashboardView

**File**: `src/components/dashboard/DashboardView.astro` (new)

**Intent**: Presentational dashboard so the page and the kitchen sink render identical markup.
Layout: greeting; profile/goals card (goals in `tabular-nums`); latest-session card; primary
"Log a session" CTA (`buttonVariants()` default); secondary links (sessions, trends) — clear visual
hierarchy with one primary action.

**Contract**: Props `{ email: string; profileLoadFailed: boolean; needsSetup: boolean; summary: string;
latestSession: { id, rowedOn, type, distanceM } | null; latestLoadFailed: boolean }`. States:
- needsSetup → card with "Set up your profile and goals" CTA to `/profile`
- latestSession null and not failed → empty state: "No sessions yet — log your first row to get a
  coaching suggestion." with the Log CTA
- latestLoadFailed → inline `ServerError` "Couldn't load your latest session." next to the latest-session card
- profileLoadFailed → `ServerError` in place of the profile card
Tokens and repo components only; `--coach` is not used here (reserved for the suggestion panel).

#### 2. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Keep data loading, pass props to `DashboardView`, render inside the shared shell; remove the
page's own sign-out and centred glass card.

**Contract**: Wrapper on `bg-background`, `<AppNav current="dashboard" />`, `<main>` landmark; passes
`latest.loadFailed` (currently ignored at `:20-21`) as `latestLoadFailed`. Loaders unchanged.

#### 3. ServerError

**File**: `src/components/auth/ServerError.tsx`

**Intent**: Error box from the `destructive` token and announced to assistive tech (C3).

**Contract**: `role="alert"`; classes from `destructive` / `destructive-foreground` / `border` tokens
only; icon kept so the error is not colour alone. Props unchanged (used by auth, profile, sessions).

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan returns 0 hits on `src/pages/dashboard.astro`, `src/components/dashboard/DashboardView.astro` and `src/components/auth/ServerError.tsx`
- `ServerError.tsx` renders `role="alert"`
- `npm run lint`, `npx astro check`, `npm test` and `npm run build` pass
- `npm run smoke` passes ("dashboard renders for signed-in user")

#### Manual Verification:

- Dashboard at 1280 px and 390 px: one clear primary action, goals readable, no horizontal scroll
- A new account with no sessions sees the empty state, not a missing link
- Keyboard: every control shows the teal focus ring in tab order

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 5: States and visual gate

### Overview

Prove the 7-state matrix on one page, check contrast, and keep screenshots as review evidence.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/kitchen-sink.astro` (new)

**Intent**: Render `DashboardView` side by side in every state from fixtures (no Supabase), plus
`Button` variants in hover/disabled/focus examples and `ServerError`.

**Contract**: Returns 404 unless `import.meta.env.DEV`. Matrix cells:
- default — set-up profile + latest session
- hover — documented as pointer check (and `Button` row)
- focus-visible — a control with forced focus example or instruction to tab through; uses `--ring`
- disabled — **N/A for the dashboard** (no disabled controls); shown on the `Button` row for the token
- error — `profileLoadFailed` and `latestLoadFailed` variants
- empty — no sessions; and needsSetup
- loading — **N/A** (server-rendered page, no client fetch; no layout jump possible)

#### 2. Smoke guard for the dev route

**File**: `scripts/smoke.mjs`

**Intent**: Prove the kitchen sink does not ship.

**Contract**: New case: `GET /dev/kitchen-sink` → status 404 against the preview build.

#### 3. Evidence and contrast

**File**: `context/changes/ui-rowing-theme-dashboard/screenshots/` (new), `tokens.md`

**Intent**: Screenshots of the kitchen sink and live dashboard at 1280 px and 390 px; contrast log for
foreground/background, muted-foreground/card, primary-foreground/primary, destructive/card,
ring/background (≥ 3:1) in the shipped dark theme.

**Contract**: Text pairs meet WCAG AA 4.5:1 (3:1 for the focus ring and large text); adjustments are
made in `:root`/`.dark` only and recorded in `tokens.md`.

### Success Criteria:

#### Automated Verification:

- `npm run build` succeeds and `npm run smoke` passes including `/dev/kitchen-sink` → 404
- Hardcoded-value scan returns 0 hits on `src/pages/dev/kitchen-sink.astro`
- `context/changes/ui-rowing-theme-dashboard/screenshots/` contains desktop and mobile captures of the kitchen sink and the dashboard

#### Manual Verification:

- Every matrix cell is shown or marked N/A with its reason
- Contrast log in `tokens.md` shows all listed pairs passing
- Focus ring is visible on every dashboard control in the dark theme

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 6: Make it stick

### Overview

Leave the rule and the check that keep the next agent on the contract (C5).

### Changes Required:

#### 1. Agent rule

**File**: `AGENTS.md`

**Intent**: A short `## UI` block (not in `CLAUDE.md`, which is the CLI-managed block).

**Contract**: Tokens live in `src/styles/global.css` (values in `:root`/`.dark`, published via
`@theme inline`; `tokens.md` in this change records origin); components in `src/components/ui` — check
there before creating one, add missing ones via `npx shadcn@latest add <name>`; `<a>` buttons in Astro
use `buttonVariants`; signed-in pages use `AppNav`; no literal colours, palette classes
(`bg-purple-600`) or arbitrary values (`p-[13px]`) in views — use role tokens; `--coach` is reserved
for the coach's suggestion; `bg-cosmic` is a migration shim, never use it in new views; kitchen sink at
`/dev/kitchen-sink`; `npm run lint` runs the literal scan on cleaned files.

#### 2. Literal scan

**File**: `scripts/ui-literals.mjs` (new), `package.json`

**Intent**: Dependency-free check running the `/10x-ui` hardcoded-value regex on an allowlist of cleaned
files; fails with `file:line` hits.

**Contract**: Allowlist: `src/pages/dashboard.astro`, `src/components/dashboard/DashboardView.astro`,
`src/components/AppNav.astro`, `src/components/auth/ServerError.tsx`, `src/pages/dev/kitchen-sink.astro`.
`"lint": "eslint . && node scripts/ui-literals.mjs"` so lint-staged's eslint run is unchanged and CI's
`npm run lint` step picks it up. Exit 1 on any hit.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on the cleaned tree
- Adding `bg-purple-600` to `DashboardView.astro` makes `node scripts/ui-literals.mjs` exit 1 with the file:line (then reverted)
- `AGENTS.md` contains a `## UI` section naming `src/styles/global.css`, `src/components/ui` and `/dev/kitchen-sink`

#### Manual Verification:

- The `AGENTS.md` UI block reads clearly in under a minute and contains no rule inviting one-off values

**Implementation Note**: After completing this phase, run `/10x-impl-review` — UI findings are triaged
by user effect, not skipped as cosmetic.

---

## Testing Strategy

### Unit Tests:

- None added — this change is presentational; existing `npm test` suites must stay green.

### Integration Tests:

- Smoke (`scripts/smoke.mjs`): sign-in → `/dashboard`; anonymous `/dashboard` → `/auth/signin`
  (existing); signed-in dashboard 200 (existing); `/dev/kitchen-sink` → 404 in preview.

### Manual Testing Steps:

1. Sign in → land on the dashboard; tab through every control and the nav.
2. Use a fresh account → empty state and set-up CTA.
3. Visit each signed-in page → same nav, correct current item.
4. Open `/dev/kitchen-sink` in `npm run dev` at 1280 px and 390 px → all 7 cells shown or N/A.

## Performance Considerations

No new runtime dependencies or fonts; Card is a few static elements. No client JS added to the
dashboard.

## Migration Notes

`bg-cosmic` stays as a token-built shim until every view is migrated; each follow-up view change
removes its usage and adds its files to the `scripts/ui-literals.mjs` allowlist. Delete the utility
when its usage count reaches 0.

## References

- Related research: `context/changes/ui-rowing-theme-dashboard/research.md`
- Change notes and motif: `context/changes/ui-rowing-theme-dashboard/change.md`
- Button contract: `src/components/ui/button.tsx:7-50`
- Wrapper pattern for signed-in pages: `src/pages/profile.astro:39-42`
- Smoke pattern: `scripts/smoke.mjs:75-95`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment and entry points

#### Automated

- [x] 1.1 `src/components/ui/card.tsx` exists and is the only new file under `src/components/ui` — f958709
- [ ] 1.2 `npm run lint` passes
- [x] 1.3 `npx astro check` passes — f958709
- [x] 1.4 `npm test` passes — f958709
- [x] 1.5 `npm run build` succeeds — f958709
- [x] 1.6 No hex inside the `bg-cosmic` block of `src/styles/global.css` — f958709
- [ ] 1.7 `npm run smoke` passes against the preview build, including sign-in → `/dashboard`

#### Manual

- [x] 1.8 Signing in lands on `/dashboard` — f958709
- [x] 1.9 Unmigrated pages (sessions list, profile, sign-in) are still legible on the new background — f958709

### Phase 2: Token values — Erg & Water

#### Automated

- [x] 2.1 `@theme inline` contains no raw colour values (only `var()` / `calc()`) — bdb23ef
- [x] 2.2 `--color-coach`, `--color-coach-foreground` and `--color-destructive-foreground` are published in `@theme inline` — bdb23ef
- [ ] 2.3 `npm run lint`, `npx astro check` and `npm run build` pass
- [x] 2.4 `context/changes/ui-rowing-theme-dashboard/tokens.md` exists with both theme columns — bdb23ef

#### Manual

- [x] 2.5 All pages show navy surfaces; shadcn buttons already in use render teal/destructive from tokens — bdb23ef
- [x] 2.6 Hovering an `outline`/`ghost` button shows a subtle tint, not orange — bdb23ef

### Phase 3: Shared navigation

#### Automated

- [x] 3.1 `grep -rn "Topbar" src/pages` returns no hits — 2c8acf8
- [x] 3.2 `src/components/AppNav.astro` returns 0 hits from the hardcoded-value scan — 2c8acf8
- [ ] 3.3 `npm run lint`, `npx astro check`, `npm test` and `npm run build` pass
- [ ] 3.4 `npm run smoke` passes

#### Manual

- [x] 3.5 On each of the 6 pages the nav shows the right current item, and Trends/Profile are reachable from every one — 2c8acf8
- [x] 3.6 Tabbing through the nav shows a teal focus ring on each link and on Sign out — 2c8acf8
- [x] 3.7 At 390 px the nav fits without horizontal scrolling — 2c8acf8

### Phase 4: Dashboard view

#### Automated

- [x] 4.1 Hardcoded-value scan returns 0 hits on `dashboard.astro`, `DashboardView.astro` and `ServerError.tsx`
- [x] 4.2 `ServerError.tsx` renders `role="alert"`
- [ ] 4.3 `npm run lint`, `npx astro check`, `npm test` and `npm run build` pass
- [ ] 4.4 `npm run smoke` passes ("dashboard renders for signed-in user")

#### Manual

- [x] 4.5 Dashboard at 1280 px and 390 px: one clear primary action, goals readable, no horizontal scroll
- [x] 4.6 A new account with no sessions sees the empty state, not a missing link
- [x] 4.7 Keyboard: every control shows the teal focus ring in tab order

### Phase 5: States and visual gate

#### Automated

- [ ] 5.1 `npm run build` succeeds and `npm run smoke` passes including `/dev/kitchen-sink` → 404
- [ ] 5.2 Hardcoded-value scan returns 0 hits on `src/pages/dev/kitchen-sink.astro`
- [ ] 5.3 `screenshots/` contains desktop and mobile captures of the kitchen sink and the dashboard

#### Manual

- [ ] 5.4 Every matrix cell is shown or marked N/A with its reason
- [ ] 5.5 Contrast log in `tokens.md` shows all listed pairs passing
- [ ] 5.6 Focus ring is visible on every dashboard control in the dark theme

### Phase 6: Make it stick

#### Automated

- [ ] 6.1 `npm run lint` passes on the cleaned tree
- [ ] 6.2 Adding `bg-purple-600` to `DashboardView.astro` makes `node scripts/ui-literals.mjs` exit 1 with the file:line (then reverted)
- [ ] 6.3 `AGENTS.md` contains a `## UI` section naming `src/styles/global.css`, `src/components/ui` and `/dev/kitchen-sink`

#### Manual

- [ ] 6.4 The `AGENTS.md` UI block reads clearly in under a minute and contains no rule inviting one-off values
