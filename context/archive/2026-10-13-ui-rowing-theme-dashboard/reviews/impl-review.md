<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rowing theme tokens and a token-built dashboard

- **Plan**: context/changes/ui-rowing-theme-dashboard/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

Coverage note: every phase still had unchecked Progress rows at review time (CI-gated lint/smoke rows and 5.3). PR #4 CI run 38614200656 has since passed `ci` (lint, astro check, test, build) and `smoke`; those rows are for `/10x-implement` to check off. Local re-run at review: astro check 0 errors, `npm test` 243/243, build OK, `node scripts/ui-literals.mjs` 5 files clean, Topbar-in-pages 0, raw colours in `@theme inline` 0.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — `role="alert"` on server-rendered errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/ServerError.tsx:11
- **Detail**: The plan asked for `role="alert"` and it now applies to every use, including static SSR errors (`DashboardView.astro:42`, `:86`, `sessions/index.astro`, `sessions/[id].astro`, `profile.astro` — which can show two at once). Alerts present at page load are announced inconsistently (some screen readers stay silent, others read every one); with Supabase down the dashboard renders two. The role is right for client-updated errors (SignInForm, SignUpForm, SuggestionPanel). This is a plan-level gap, not drift.
- **Fix A ⭐ Recommended**: Add an `announce?: boolean` prop (default `false` → no live role); the React islands that set the error after an interaction pass `announce`.
  - Strength: Static errors stay visible and readable without noisy load-time alerts; interactive errors still interrupt.
  - Tradeoff: Touches the three island call sites; the plan's 4.2 wording ("renders role=alert") needs an addendum.
  - Confidence: MED — standard ARIA guidance; call sites found by grep, not exhaustively traced.
  - Blind spot: Haven't checked whether any island renders ServerError on first paint.
- **Fix B**: Keep `role="alert"` everywhere and accept the risk.
  - Strength: Zero change; errors are never missed by assistive tech that does announce.
  - Tradeoff: Double/inconsistent announcements on failure pages.
  - Confidence: HIGH — current behaviour is known.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — `announce` prop, default off; only SuggestionPanel opts in

### F2 — `<main>` landmark owned by `DashboardView`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/dashboard/DashboardView.astro:33
- **Detail**: The plan put `<main>` on the page (`dashboard.astro`); it landed inside the presentational component. `/dashboard` is fine, but the kitchen sink renders five `<main>` elements nested in `<section>`s and five extra `<h1>`s — and the component no longer composes into any other page. No other component in `src/components` owns a landmark.
- **Fix**: Move `<main>` to `src/pages/dashboard.astro` (wrapping `<DashboardView>`) and make the component's root a `<div>`; the kitchen sink then renders plain sections.
- **Decision**: FIXED — `<main>` moved to dashboard.astro, component root is a `<div>`

### F3 — Live dashboard screenshots missing (5.3)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-rowing-theme-dashboard/screenshots/
- **Detail**: Five kitchen-sink captures exist (1280 and 390 px); the live `/dashboard` captures the plan requires are not there because they need a signed-in session.
- **Fix**: Sign in on the dev server and capture `/dashboard` at 1280 and 390 px into `screenshots/`.
- **Decision**: DEFERRED — no signed-in session in the preview pane; Progress 5.3 stays open until live captures are added

### F4 — Email shown twice on the dashboard

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/AppNav.astro:34
- **Detail**: AppNav shows the email at `sm`+ (not in the plan's contract), and `DashboardView.astro:36` shows it under "Welcome back", so desktop shows it twice.
- **Fix**: Drop the email from AppNav (the plan's nav contract didn't include it).
- **Decision**: FIXED — email removed from AppNav (and the unused `user` binding)

### F5 — Duplicate/unlabelled navigation landmarks

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/dashboard/DashboardView.astro:109
- **Detail**: The dashboard's `<nav aria-label="More">` only repeats AppNav's Sessions and Trends links (unplanned landmark). Separately, `sessions/index.astro:79` has an unlabelled pagination `<nav>` that now sits next to AppNav's `nav[Main]`.
- **Fix**: Make the "More" links a plain `<div>` (or drop them) and add `aria-label="Pagination"` to the sessions-list nav.
- **Decision**: FIXED — "More" links in a plain `<div>`; `aria-label="Pagination"` on the sessions list nav

### F6 — Current nav item signalled by colour only

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/AppNav.astro:57
- **Detail**: The selected link differs only by `bg-accent text-accent-foreground`, close to the ghost hover tint; there is no weight or underline cue. (`aria-current` is set correctly for assistive tech.)
- **Fix**: Add `font-semibold text-foreground` to the current-item classes.
- **Decision**: FIXED — `font-semibold` on the current nav item

### F7 — Native controls render light in the dark theme

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css (`.dark` block)
- **Detail**: No `color-scheme: dark`, so date pickers, scrollbars and `<select>` popups on the session/profile forms render with light system chrome on the navy theme.
- **Fix**: Add `color-scheme: dark;` to the `.dark` block (token layer).
- **Decision**: FIXED — `color-scheme: dark` in `.dark`

### F8 — Card titles are not headings

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/card.tsx:28
- **Detail**: shadcn `CardTitle` renders a `div`, so the dashboard has one `<h1>` and screen-reader heading navigation can't reach "Profile and goals" / "Latest session".
- **Fix**: In `DashboardView`, give the two `CardTitle`s `role="heading" aria-level={2}` (leave the shadcn file as generated).
- **Decision**: FIXED — dashboard CardTitles carry `role="heading" aria-level={2}`

### F9 — Kitchen-sink smoke step fails against a dev server

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:75
- **Detail**: Default `BASE_URL` is `localhost:4321`, the same port as `npm run dev`, where the kitchen sink returns 200; the step only passes against `npm run preview` (as CI uses).
- **Fix**: State in the smoke header comment that it runs against `npm run preview`, not `npm run dev`.
- **Decision**: FIXED — smoke header says to run against `npm run preview`

### F10 — "React only for interactivity" vs static shadcn React components

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:21
- **Detail**: `DashboardView.astro` renders React `Card` components server-side with no client directive. That ships no JS and follows the `src/components/ui` rule, but contradicts the literal "React only for interactivity" line, so a future agent may "fix" it.
- **Fix**: Add to the `## UI` block: "shadcn React components from `src/components/ui` may be rendered statically in Astro (no client directive)."
- **Decision**: FIXED — `## UI` states shadcn React components may render statically
