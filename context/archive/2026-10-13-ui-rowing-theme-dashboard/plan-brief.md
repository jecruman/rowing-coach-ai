# Rowing theme tokens and a token-built dashboard — Plan Brief

> Full plan: `context/changes/ui-rowing-theme-dashboard/plan.md`
> Research: `context/changes/ui-rowing-theme-dashboard/research.md`

## What & Why

The app still wears the starter's purple "AI template" look, and no screen reads the design tokens
that already exist. This change gives those tokens a rowing identity ("Erg & Water", dark-first),
rebuilds the dashboard — the first screen after sign-in — from them, and fixes how rowers arrive and
move around, so every later view can copy a contract instead of literal classes.

## Starting Point

`src/styles/global.css` ships a correct shadcn/Tailwind v4 token system with neutral values that 0 of
35 view files use; pages paint themselves with a hex `bg-cosmic` background and purple palette
classes. Sign-in lands on the starter landing page, and the dashboard is the only signed-in page
without the shared top bar.

## Desired End State

Every page sits on navy-water tokens. After sign-in the rower lands on a dashboard built only from
tokens, `Card` and `Button`, with one clear "Log a session" action, a real empty state, an inline
error when the latest session can't load, and a visible teal focus ring. Every signed-in page shares
one navigation. A dev-only kitchen sink shows all 7 states, and `npm run lint` blocks literal colours
in cleaned files.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Contract variant | Extend the existing shadcn tokens; no second init | The system is set up correctly, just unused | Research |
| Theme mode | Dark-first (`.dark` on `<html>`), light values defined but not shipped | Unmigrated pages draw white text and stay legible on dark | Plan |
| Palette | Erg & Water: river-teal primary, buoy-orange `--coach` for the suggestion, navy surfaces | Distinct rowing identity with one signal colour for the coach | Plan |
| Coach colour token | New `--coach` pair, not `--accent` | `--accent` is the hover background of outline/ghost buttons | Plan (from `button.tsx:16,18`) |
| Font | System stack + `tabular-nums` | No dependency, no download on a phone after rowing | Plan |
| Navigation scope | New `AppNav` on all 7 signed-in pages; bodies untouched | Fixes per-page navigation once, later views inherit it | Plan |
| `bg-cosmic` | Re-point at tokens, delete later | Deleting it breaks 10 unmigrated pages | Research |
| Sign-in redirect | `/dashboard` (smoke updated) | Rowers were landing on the starter marketing page | Research |
| Kitchen sink | `/dev/kitchen-sink`, 404 outside dev builds | Visual gate without shipping a debug page | Plan |
| Guard | `AGENTS.md` UI rule + `scripts/ui-literals.mjs` in `npm run lint` | A failing check beats a forgotten rule; no new dependency | Plan |

## Scope

**In scope:**
- Token values for both themes, `--coach`, `--destructive-foreground`, `tokens.md` deposit
- shadcn `Card`; `AppNav`; `DashboardView` + dashboard page; `ServerError` on tokens with `role="alert"`
- Layout: dark class, viewport, title; sign-in redirect
- Kitchen sink, screenshots, contrast log; AGENTS.md rule; literal-scan script

**Out of scope:**
- Restyling other page bodies (sessions, trend, profile, auth) and the landing page — follow-up changes
- Theme toggle, fonts, chart/sidebar tokens, return-to after sign-in, `Banner.astro`
- Screenshot-test tooling (Playwright/Storybook)

## Architecture / Approach

Values live in `:root`/`.dark` and are published through `@theme inline`; views use role classes only.
`dashboard.astro` keeps its loaders and hands plain props to a presentational `DashboardView.astro`,
which the dev-only kitchen sink renders from fixtures in every state. `AppNav.astro` replaces
`Topbar` on signed-in pages (`Topbar` stays for the landing until its own change).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Environment and entry points | Card, `.dark` on html, viewport/title, token-built `bg-cosmic`, sign-in → dashboard | shadcn CLI trying to rewrite `global.css` |
| 2. Token values | Erg & Water in both themes + `--coach`, `tokens.md` | Contrast of teal/orange on navy |
| 3. Shared navigation | `AppNav` on 7 pages with current-page state | Nav overflowing at 390 px |
| 4. Dashboard view | Token-only dashboard with empty + error states | Visual hierarchy still flat |
| 5. States and visual gate | Kitchen sink, screenshots, contrast log, smoke 404 | Dev-only guard leaking to prod |
| 6. Make it stick | AGENTS.md UI rule, `ui-literals.mjs` in lint | Allowlist forgotten in later changes |

**Prerequisites:** Local dev with Supabase env; preview build runnable for `npm run smoke`.
**Estimated effort:** ~2–3 sessions across 6 phases.

## Open Risks & Assumptions

- Unmigrated pages keep purple CTAs on the new navy background until their own change — legible but off-brand.
- Starting oklch values are proposals; Phase 5 may adjust lightness for AA contrast (recorded in `tokens.md`).
- Light theme is defined but unverified until a toggle change ships it.

## Success Criteria (Summary)

- A rower signs in, lands on a rowing-branded dashboard, and can reach every page from one nav.
- Every dashboard state (empty, error, set-up, keyboard focus) is visible and readable on desktop and phone.
- The next agent finds the rule in `AGENTS.md`, and lint fails if it reintroduces literal colours.
