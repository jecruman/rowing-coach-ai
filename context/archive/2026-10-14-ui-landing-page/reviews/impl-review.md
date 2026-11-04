<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing page

- **Plan**: context/changes/ui-landing-page/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

Coverage note: all five phases were reviewed against `0393b72..origin/main` (`fd70b54`). Rows 2.5 and 5.5 were unchecked at review time, waiting on the owner's production check. CI passed `ci` and `smoke` on PR #8 and on `main`. Re-run locally at review: `astro check` 0 errors, `npm test` 243/243, `npm run build` OK, `node scripts/ui-literals.mjs` 8 files clean, and the grep-based criteria for 1.4, 1.5, 2.1, 2.2, 3.2, 3.3, 4.1, 4.2 and 5.3. The 5.2 break-check was not repeated; it passed during implementation. Nothing was tested in a browser during this review, so the screen-reader points are reasoned from the code.

Checked with no finding: the redirect (exact path, literal target, no loop, no extra Supabase call), no sign-up link on public pages, no stale references to the deleted components, every other product claim on the page against `metrics.ts`, `limits.ts`, `context.ts` and `SessionAnalysis.astro`, and everything under What We're NOT Doing.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Sign-in page is a dead end for anyone without an account

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/signin.astro:14
- **Detail**: Removing the Sign up prompt left the page with no links at all (`signin.astro` and `SignInForm.tsx` have no `href`). Someone without an account, or redirected here from a protected route without ever seeing the landing page's private note, only gets a login error, with no explanation and no way back to `/`. The plan's removal caused this.
- **Fix**: Add one static line under the form: "No account? This coach is used by invitation." with a link to `/`. It doesn't link sign-up, so it stays within the `AGENTS.md` rule.
- **Decision**: FIXED — line under the form linking to `/`

### F2 — Focus ring contrast is logged as 10.05:1 but is painted at 3.30:1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/ui-landing-page/tokens.md:59, src/components/ui/button.tsx:8
- **Detail**: The contrast log measures solid `--ring`, but `button.tsx` paints `focus-visible:ring-ring/50`. Composited on the background that measures 3.30:1. It clears the 3:1 target with little margin, and the hero link has no border, so the ring is its only focus indicator. The automated browser could not draw the ring, so row 4.4 rests only on a manual check. The dashboard change's log has the same mismeasurement.
- **Fix A ⭐ Recommended**: Correct the log to 3.30:1 and change no colours.
  - Strength: The record becomes true, it still passes, and `button.tsx` stays as shadcn generated it.
  - Tradeoff: The margin over 3:1 stays thin.
  - Confidence: HIGH — calculated from the shipped token values.
  - Blind spot: The ring has not been seen in a real browser by this review.
- **Fix B**: Also strengthen the ring in `button.tsx` (for example `ring-ring/80`).
  - Strength: A clearly visible focus ring on every button in the app.
  - Tradeoff: Touches a shared component and every view, beyond this change's scope.
  - Confidence: MED — straightforward, but needs a visual pass across views.
  - Blind spot: Effect on the destructive variant's own ring classes.
- **Decision**: FIXED (Fix A) — log corrected to 3.30:1; no colour change

### F3 — `<main>` is inside LandingView, not on the page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/landing/LandingView.astro:51
- **Detail**: The plan says "`<main>` on the page". `dashboard.astro:41` owns it at page level, a pattern set by finding F2 of the dashboard review. This view repeats the same mistake. The live page is correct today, but rendering the view in the kitchen sink would nest landmarks.
- **Fix**: Keep the component's root as a `<div>` and render `<main>` around the content from `src/pages/index.astro`. The view's `<header>` needs to stay outside `<main>`, so split it or pass the content through a slot.
- **Decision**: FIXED — `index.astro` owns the header and `<main>`; the view's root is a `<div>`

### F4 — Progress isn't finished: open rows, uncommitted updates, and hashes off main

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-landing-page/plan.md (`## Progress`)
- **Detail**: Rows 2.5 and 5.5 need the owner's production check. Row 4.4 was checked from a "commit, push and merge" message, without an explicit report that the ring was seen. The Phase 4 and 5 hash updates and row 5.4 are uncommitted. The recorded hashes (`6d1fcca`, `6c9c47a`, `0707969`, `e2ae69b`, `f3d220d`) aren't on `main`, because the PRs were squash-merged.
- **Fix**: Confirm 2.5, 4.4 and 5.5 on production, land the close-out through a PR, then run `/10x-archive` from `main` so it can repoint the hashes to `5053afc`, `718bd5e`, `3c805d6` and `fd70b54`.
- **Decision**: PENDING — fix chosen: owner confirms 2.5, 4.4 and 5.5 on production, then close-out and archive from `main`

### F5 — Example's "24 min" doesn't quite follow the product's definition

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/landing/LandingView.astro:20
- **Detail**: 24 min is 6 × (2 + 2), which counts a rest after the last piece and no warm-up. `schema.ts:28` defines total time as "work plus rest, including warm-up and cool-down". A rower would notice, and the source comment says the numbers agree with the product's rules. It is not a false claim, since a real suggestion could say this.
- **Fix**: Change the sample to 22 min, which is six pieces with five rests between them. A longer figure with warm-up could break the product's +10% volume limit for a session of about 21 minutes.
- **Decision**: FIXED — example shows 22 min

### F6 — Landing description is served on every page

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/layouts/Layout.astro:12-14
- **Detail**: No page passes `description`, so every page, including `/auth/signin`, gets the default. "One safe next session" is also a stronger claim than the page's "checked against fixed safety limits". The plan asked for this default, so this is a plan-level nit.
- **Fix**: Reword the default to match the page: "...and get one next session, checked against fixed safety limits."
- **Decision**: FIXED — default description matches the page's wording

### F7 — Example and steps could be clearer to screen readers

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/landing/LandingView.astro:72, :97, :122
- **Detail**: The card isn't a labelled group, so someone jumping straight to the "Next session" heading hears invented numbers with no example cue. Separately, Safari with VoiceOver can drop list semantics when list markers are removed, and the visible step numerals are `aria-hidden`, so the numbering could disappear. That browser behaviour is known but untested here.
- **Fix**: Add `role="group"` with `aria-labelledby` to the card, rename the heading "Example next session", and add `role="list"` to the `<ol>`.
- **Decision**: PARTLY FIXED — card is a labelled group and its heading says "Example next session". `role="list"` dropped: the repo's `no-redundant-roles` lint rule rejects it, so the Safari list-semantics risk stays, untested

### F8 — Nothing automatically enforces "no public sign-up link"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:75
- **Detail**: The home smoke steps only check status, so any 200 passes. The product decision that public pages don't link sign-up is held only by a rule in `AGENTS.md`.
- **Fix**: Add an `html` check to the home step and to a new `/auth/signin` step: the text must not include `/auth/signup`.
- **Decision**: FIXED — smoke checks `/` and `/auth/signin` for `/auth/signup`; first runs in CI

### F9 — No cache headers or auth timeout on the session paths

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:14, src/middleware.ts:10-13
- **Detail**: Pre-existing, and now more relevant because `/` varies by session. `setAll` discards the no-store headers `@supabase/ssr` provides, and the repo sets no `Cache-Control`. The risk is low today: a 302 isn't cached without explicit freshness, and nothing in the repo tells Cloudflare to cache HTML. Zone settings can't be seen from the repo. `getUser` also has no timeout, and its errors are ignored, so a slow Supabase stalls signed-in visits and an error shows a signed-in rower the landing page with nothing logged. Anonymous visitors make no network call.
- **Fix**: Open a separate change: apply the `setAll` headers, set `Cache-Control: private, no-store` on the redirect, log non-session errors, and consider a fetch timeout.
  - Strength: Closes a class of problem across every route, with its own review.
  - Tradeoff: More work than this change's scope, for a risk that is low today.
  - Confidence: MED — read from the code and library source, not reproduced.
  - Blind spot: Cloudflare zone cache settings.
- **Decision**: DEFERRED — recorded in `follow-ups/review-fixes.md` for a separate change

### F10 — Small inaccuracies in the change's docs

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/ui-landing-page/states.md:8-9, context/changes/ui-landing-page/tokens.md:29, :37-43, AGENTS.md:42
- **Detail**: `states.md` marks hover and focus as "Shown" though its own text says they weren't captured, and it names `accent` for the header hover when dark mode likely uses `input/50`. `tokens.md` says `font-display` is for headlines only, but the name and the unplanned step numerals also use it, and its token list omits `input` and `accent-foreground`. `AGENTS.md:42` says the kitchen sink shows "every token and component", which `font-display` and the landing view break. The two desktop screenshots look blurry at 1280 × 900.
- **Fix**: Correct those lines: mark hover and focus "Reasoned from classes", widen the `font-display` rule to "landing page display text", add the two tokens, and reword `AGENTS.md:42`. Retake the desktop screenshots if you want them sharp.
- **Decision**: FIXED — docs corrected; screenshots retaken, desktop ones still blurry from the capture tool
