---
date: 2026-10-13T22:38:31+02:00
researcher: Claude (claude-opus-5-5)
git_commit: 39ae2ecf85ec9612025fd3f403b9bb30dd942d45
branch: main
repository: rowing-coach-ai (C:\JESUS\10xDevs)
topic: "UI audit of /dashboard against the design-system contract (tokens + repo components)"
tags: [research, ui, design-tokens, shadcn, tailwind, dashboard, app-shell]
status: complete
last_updated: 2026-10-13
last_updated_by: Claude (claude-opus-5-5)
---

# Research: UI audit of /dashboard against the design-system contract

**Date**: 2026-10-13T22:38:31+02:00
**Researcher**: Claude (claude-opus-5-5)
**Git Commit**: 39ae2ecf85ec9612025fd3f403b9bb30dd942d45 (working tree has uncommitted, unrelated `.claude/` changes)
**Branch**: main
**Repository**: rowing-coach-ai

## Research Question

Two-way `/10x-ui` audit of `/dashboard` (`src/pages/dashboard.astro`):
**source → views** (where tokens and shared components live and which views read them) and
**view → source** (for each literal on the dashboard, which token or component should cover it),
plus the accidental-architecture question: *what does a user see arriving at the dashboard logged
out, with no data, or straight from a link?* Output: 3–5 charges with file, line and user effect.

## Summary

- **Contract variant: fresh starter with a dead token file.** `src/styles/global.css` defines the
  stock shadcn *neutral* token set in `:root` (lines 6–39) and `.dark` (41–73), published correctly
  through `@theme inline` (75–111, every entry a `var()`/`calc()`, no raw colours). Across the 35
  files under `src/pages` and `src/components` (excluding `src/components/ui`), semantic-token class
  usage is exactly 0. Views paint themselves with `@utility bg-cosmic` (`global.css:113-115`, raw hex)
  plus Tailwind palette classes.
- **`.dark` is never applied** — no `class="dark"`, `classList`, or `prefers-color-scheme` in `src/`
  (inspected: all `.astro/.tsx/.ts/.css` under `src/`); `Layout.astro:14` is `<html lang="en">` with
  no class. `body` gets the light `--background` (`global.css:122`), which each page covers with
  `bg-cosmic`. The dark look is page-level, not token-level.
- **Components dir:** `src/components/ui` holds `button.tsx` and `LibBadge.astro` (the latter has 0
  importers). `Button` is imported by 3 files (SubmitButton, DeleteSessionButton, SuggestionPanel),
  none of them the dashboard. `buttonVariants` is exported (`button.tsx:50`) and is usable from
  `.astro` for `<a>` elements.
- **Dashboard is the only signed-in page without `Topbar`**, builds its own sign-out, and sign-in
  redirects to `/` (the starter landing, `signin.ts:19`), not `/dashboard`.
- **Agent rules are silent on tokens** (`AGENTS.md:21`, `:28`); the archived metric-trend plan told
  the implementer to copy the cosmic layout (`context/archive/2026-10-13-metric-trend/plan.md:112`) —
  the propagation path for literals.
- **No screenshot tooling exists** (no Playwright/Storybook installed); the visual gate must be a
  kitchen-sink page.

## Charges

| # | Category | Evidence (file:line) | Effect on the user | Token / component that should cover it |
|---|---|---|---|---|
| C1 | Missing tokens | `src/styles/global.css:113-115` (`bg-cosmic` hex gradient); `src/pages/dashboard.astro:40` (`bg-cosmic`), `:41` (`border-white/10 bg-white/10 text-white`), `:42` (`from-blue-200 to-purple-200` gradient heading), `:45` (`text-blue-100/80`); 12 lines in `dashboard.astro` match the hardcoded-value scan | The app looks like the starter's purple "AI template", not a rowing product; any token change (rebrand, dark mode) never reaches the dashboard because nothing reads the tokens | `bg-background`, `bg-card`/`text-card-foreground`, `text-foreground`, `text-muted-foreground`, `border-border`; new values for `--primary`/`--accent` etc. in `:root`/`.dark` |
| C2 | Missing shared component | `src/pages/dashboard.astro:55` and `:69` (hand-rolled purple `<a>` buttons, `bg-purple-600 … hover:bg-purple-500`), `:62`, `:73`, `:79`, `:82` (`text-purple-300 hover:underline` links), `:87-90` (sign-out `<button>` with `border-white/20 bg-white/10`), `:41` (hand-rolled card) | No dashboard control has a `focus-visible` style (only `hover:`), so keyboard users lose their place; the same "primary button" is styled differently on each page (`bg-purple-600` appears on 10 lines repo-wide; 7 are primary CTAs — SubmitButton.tsx:23, SuggestionPanel.tsx:187, Welcome.astro:31, dashboard.astro:55/:69, sessions/index.astro:104, sessions/[id].astro:143; the other 3 are selected-state toggles in SessionForm.tsx:165/:366 and trend.astro:90) | `buttonVariants({ variant: "default" \| "outline" \| "link" })` from `src/components/ui/button.tsx:7-33` (has `focus-visible:ring-ring/50 ring-[3px]`, line 8); add `card` via `npx shadcn@latest add card` |
| C3 | Missing tokens (error state) | `src/components/auth/ServerError.tsx:11` (`border-red-500/30 bg-red-900/30 text-red-300`), rendered by the dashboard at `dashboard.astro:48-51` | When the profile read fails, the error is communicated by a red tint on a dark background and is not announced (`<p>` without `role="alert"`); it will not follow a theme change | `destructive` token (`global.css:22`, `.dark` :56); no `--destructive-foreground` token exists in either block — add one or use `text-destructive` |
| C4 | Accidental architecture | `src/pages/api/auth/signin.ts:19` (`redirect("/")`); `src/pages/dashboard.astro:39-95` (no `Topbar`, own sign-out `:85-92`); `src/components/Topbar.astro:6-19` (links only Dashboard + Sign out; no Sessions/Trends/Profile, no `<nav>`); `src/layouts/Layout.astro` (no shell, no `<main>`) | After signing in, a rower lands on the "10x Astro Starter" page still offering "Sign In / Sign Up" (`Welcome.astro:30-49`); once inside, navigation changes from page to page — Profile and Trends are reachable only from the dashboard/sessions list | One app shell (header with `<nav>`: Dashboard, Sessions, Trends, Profile, Sign out) used by every signed-in page; sign-in redirect to `/dashboard` |
| C5 | Accidental architecture (rule) | `AGENTS.md:21`, `:28` (shadcn location named, nothing about tokens or literals); `context/archive/2026-10-13-metric-trend/plan.md:112` ("follow the layout of `src/pages/sessions/index.astro` (Layout, Topbar, gradient heading, cards…)") | Every new view an agent builds copies the literal purple classes, so the next screen undoes this change | UI block in `AGENTS.md` (not `CLAUDE.md` — lines 1–89 are entirely the `@przeprogramowani/10x-cli` managed block) |

### Candidates for deferral (recorded, not dropped)

- **Return-to after sign-in** — `src/middleware.ts:20` redirects to `/auth/signin` with no return
  path; a deep link to `/sessions/<id>` loses its target. Auth-flow change, not visual — defer.
- **`Banner.astro` hex colours** (scoped `<style>` block, `.banner--info/warning/error`) rendered by
  `Layout.astro:22-35` only when config is missing; Polish text under `<html lang="en">`. Global, rarely
  seen — defer to a later view sweep.
- **Other views** (sessions list/detail/new/edit, trend, profile, auth pages, landing) keep `bg-cosmic`
  and literals; they are follow-up changes. Note: if `bg-cosmic` is removed in this change, those pages
  fall back to the light `body` background with white text — the plan must keep `bg-cosmic` (or
  re-point it at tokens) until each view migrates.

## Detailed Findings

### Token source (source → views)

- `:root` tokens at `global.css:7-38` and `.dark` at `:42-72` are all neutral oklch (stock shadcn
  `baseColor: "neutral"`, `components.json:9`). Chart (`--chart-1..5`) and sidebar tokens exist.
- `@theme inline` (`global.css:75-111`) publishes `--color-*` and `--radius-sm/md/lg/xl`; no raw colours
  inside it, so dark mode will work once `.dark` is applied.
- Base layer: `* { @apply border-border outline-ring/50 }` (`:119`), `body { bg-background
  text-foreground }` (`:122`).
- Fonts: no `@font-face`, Google Fonts link, `font-family` or `--font-*` in `src/`, `public/`,
  `astro.config.mjs`; Tailwind default stack. `tabular-nums` appears once (`sessions/trend.astro:136`).

### Dashboard render states (view → source; input for the 7-state matrix)

- **default (set up):** summary line from boat, age, goals (`dashboard.astro:27-36`) + "Edit profile".
- **needsSetup** (no profile or no goal, `:24`): purple CTA to `/profile` (`:52-58`).
- **error:** `loadFailed` from `loadProfileAndGoals` shows `ServerError` (`:48-51`).
  `loadLatestSession` failures are logged and ignored (`:20-21`, `src/lib/services/sessions/load.ts:116-129`),
  so a failed sessions read looks identical to "no sessions".
- **empty:** no "no sessions yet" state — the latest-session link is simply absent (`:73-78`); the only
  cue is the "Log a session" CTA.
- **loading:** N/A for the page itself (SSR, no island); sign-out is a plain form submit.
- **hover:** present on all controls (palette classes). **focus-visible:** none on the dashboard;
  only the global `outline-ring/50` from the light `--ring` (`global.css:119`) — visibility on the dark
  `bg-cosmic` not verified by render. **disabled:** no disabled controls on this view.
- **Logged out:** `src/middleware.ts:4` protects `/dashboard`, `/profile`, `/sessions` by prefix
  (`:18`) and redirects to `/auth/signin` (`:20`). The `user === null` fallback in the page (`:14-19`)
  is unreachable in practice.
- **Missing config:** `createClient` returns null (`src/lib/supabase.ts:18-20`), middleware treats the
  user as signed out (`:14-15`), so the user lands on sign-in with the `Layout` banner.

### Navigation (C4 detail)

| Page | Topbar | Own sign-out | Reaches |
|---|---|---|---|
| `dashboard.astro` | no | yes (`:85-92`) | sessions, trend, profile, new, latest |
| `profile.astro` | yes (`:42`) | via Topbar | dashboard |
| `sessions/index.astro` | yes (`:37`) | via Topbar | dashboard, trend, new |
| `sessions/new.astro` | yes (`:26`) | via Topbar | dashboard |
| `sessions/[id].astro` | yes (`:87`) | via Topbar | dashboard, sessions, edit, new |
| `sessions/[id]/edit.astro` | yes (`:34`) | via Topbar | dashboard, sessions, session |
| `sessions/trend.astro` | yes (`:97`) | via Topbar | dashboard, sessions |
| `index.astro` → `Welcome.astro` | yes (`Welcome.astro:26`) | via Topbar | dashboard (Topbar) |
| `auth/*` (3 pages) | no | no | sign in ↔ sign up |

After sign-in → `/` (`signin.ts:19`); after sign-out → `/` (`signout.ts:9`).

### Layout and mobile

- `Layout.astro:10` default title "10x Astro Starter"; `:17` viewport `width=device-width` without
  `initial-scale=1`. PRD requires comfortable phone use (`context/foundation/prd.md:110`); no other UI,
  branding, accessibility or dark-mode NFR in `prd.md` or `tech-stack.md`.

### Guards available for "Make it stick"

- Pre-commit: `.husky/pre-commit` → lint-staged (`package.json:62-69`: `eslint --fix` on
  `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`).
- CI (`.github/workflows/ci.yml`): `astro sync`, `npm run lint`, `npm test`, `astro check`, build; then
  smoke. ESLint has no Tailwind plugin and no literal-colour rule; `prettier-plugin-tailwindcss` only
  sorts classes (`.prettierrc.json`). A scoped grep script (like the existing `scripts/rls-check.mjs`
  pattern) could carry the hardcoded-value scan without a new dependency.
- No Playwright, Storybook or `toHaveScreenshot` in the repo (inspected: config files, `node_modules`
  for `@playwright`/`@storybook`, repo ts/tsx/js/mjs/json/yml excluding build dirs). Visual gate =
  kitchen-sink page + manual/agent screenshots at desktop and one mobile width.

## Code References

- `src/styles/global.css:6-39`, `:41-73`, `:75-111`, `:113-115`, `:119`, `:122` — token values, dark values, publication, `bg-cosmic`, base layer
- `src/components/ui/button.tsx:7-33`, `:35-48`, `:50` — variants, `asChild` via Radix Slot, `buttonVariants` export
- `src/pages/dashboard.astro:13-21`, `:24`, `:39-95` — data loading, needsSetup, markup
- `src/components/auth/ServerError.tsx:11` — red literal error box
- `src/components/Topbar.astro:6-32` — current top bar (signed in / out)
- `src/layouts/Layout.astro:10`, `:14`, `:17`, `:22-35` — title, lang, viewport, config banners
- `src/middleware.ts:4`, `:14-20` — protected routes, redirect
- `src/pages/api/auth/signin.ts:19`, `src/pages/api/auth/signout.ts:9` — post-auth redirects
- `src/lib/services/sessions/load.ts:116-129` — latest-session read, failure logged only
- `AGENTS.md:21`, `:28` — current UI-adjacent rules

## Architecture Insights

- Tailwind v4 + shadcn split is set up correctly (values in `:root`/`.dark`, published by `@theme
  inline`); the system is not broken, it is unused. Extend it — no second `shadcn init`.
- Astro pages can use `buttonVariants()` directly on `<a>` (no React island needed); React islands use
  `<Button>`. Class merging must go through `cn()` (`AGENTS.md:28`).
- `bg-cosmic` is the single shared hook into every page's background (11 usages); re-pointing it at a
  token is a cheap global lever, deleting it is a global break.

## Historical Context (from prior changes)

- No archived change made a styling decision; all said "match the existing look":
  `context/archive/2026-10-13-metric-trend/plan.md:13` (records "dark 'cosmic' cards, `max-w-md` phone
  layout"), `:112` (copy `sessions/index.astro` layout); `context/archive/2026-10-11-session-history/plan.md:70`
  ("existing card style"); `context/archive/2026-10-11-suggestion-done-loop/plan.md:118` (accessible
  fieldset "matching the existing form styling"); `context/archive/2026-10-08-first-session-suggestion/plan.md:284`
  (accessible live region for "Coach is thinking…"). Keyword search only — differently worded decisions
  could be missed.
- `context/foundation/lessons.md` has no UI lesson.

## Related Research

Not applicable — no prior UI research in `context/changes/**` or `context/archive/**`.

## Open Questions (product choices for /10x-plan)

1. **Theme mode:** light app with `.dark` tokens defined but not switched on (toggle deferred), or
   follow `prefers-color-scheme` now? Either way, dark values change at the token layer only.
2. **Font:** keep the system stack (zero dependency) or add a self-hosted font package (new dependency —
   learner decides).
3. **Kitchen-sink location:** a route such as `/dev/kitchen-sink` must not ship as a public production
   page — guard with `import.meta.env.DEV` or the middleware.
4. **Scope of the shell:** migrating `Topbar` into a shared shell touches every signed-in page's import;
   the plan should decide whether this change swaps the shell on all pages (navigation only, no restyle)
   or only on the dashboard.
5. **Hardcoded-value guard:** a dependency-free `scripts/ui-literals.mjs` scoped to cleaned views in
   lint/CI, or rule-only.
