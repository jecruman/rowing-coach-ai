# Landing page — Implementation Plan

## Overview

Replace the starter demo at `/` with the honest front door of a private rowing coach. Signed-in rowers go straight to the dashboard. Signed-out visitors see a rowing-specific page that says the coach is private, shows a clearly labelled example of the product, explains how it works, and offers only Sign in.

Run under `/10x-ui`. The problem statement comes from `context/changes/ui-landing-page/frame.md`:

> `/` is the daily front door of a private, family-only coach, yet it presents an unrelated starter kit and treats everyone as a stranger, so it neither gets its two real users into the app nor truthfully shows anyone else what this product is.

## Current State Analysis

- `src/pages/index.astro` renders `src/components/Welcome.astro`, whose visible text is entirely about the starter (`:23`, feature cards). It has 20 literal-scan lines, and `src/components/Topbar.astro` has 7.
- `Welcome.astro` is the only importer of `Topbar.astro`, and `index.astro` is the only importer of `Welcome.astro`, so both can be deleted.
- The hero always offers Sign In / Sign Up (`Welcome.astro:30-39`), whether or not a session exists. The user and their partner open the app through `/`.
- Nothing links to `/` except the sign-out redirect (`src/pages/api/auth/signout.ts:9`). Sign-in goes to `/dashboard` (`signin.ts:19`).
- AI suggestions run only for `COACH_EMAILS` (`src/lib/services/coaching/allowlist.ts:20`), which holds only the user and their partner in production. Anyone else gets a safe default labelled "Personal coaching is not enabled for this account" (`src/components/sessions/SuggestionPanel.tsx:33`).
- `src/pages/auth/signin.astro:17` links to Sign up, so hiding sign-up has to cover this page too.
- No rowing imagery or logo exists. `public/` holds `favicon.png` and `template.png` (the starter banner, used by `README.md:3`). `src/layouts/Layout.astro` has no description tag.
- Tokens and components are ready: Erg & Water in `src/styles/global.css`, `Card` and `buttonVariants` in `src/components/ui`, rules in `AGENTS.md` `## UI`.

## Desired End State

- A signed-in visit to `/` lands on `/dashboard`.
- A signed-out visit to `/` shows a page that a rower recognises as being about rowing within a glance, says it is private and invite-only, and has Sign in as its only action.
- Nothing on the page claims a stranger can get coaching, and every claim about the product matches what has shipped.
- `/auth/signin` no longer advertises sign-up. `/auth/signup` still works by direct link, so the owner can invite someone.
- `Welcome.astro` and `Topbar.astro` are gone, and `npm run lint` keeps the new landing files free of literals.

### Key Discoveries:

- A `return` at the top of an Astro page crashes ESLint's `no-misused-promises` rule here (found during `ui-rowing-theme-dashboard`), so the redirect belongs in `src/middleware.ts`, which already resolves the user on every request.
- `scripts/smoke.mjs:75` tests `/` signed out, and `:200-201` covers sign-out, so the new redirect fits the existing sequence.
- `@fontsource-variable/archivo` 5.3.0 is OFL-1.1, and its weight-axis Latin file is 35 KB (`wght.css`, checked with `npm pack`).
- Browsers download a web font only when rendered text uses it, so app pages on the system font do not fetch Archivo even if its `@font-face` rule reaches them.

## What We're NOT Doing

- Opening AI coaching to strangers, changing `COACH_EMAILS`, or answering PRD Open Question 1.
- Closing registration: production Supabase settings stay as they are and `/auth/signup` keeps working. Someone who finds the URL can still register and gets the safe default, as they do today.
- A waitlist, contact form or "request access" action.
- Photography, stock or generated images, and a designed logo or wordmark beyond the name set in the display font.
- Replacing `favicon.png`, or adding social-share (Open Graph) images.
- Applying the display font to app pages; they stay on the system font.
- Restyling the sign-in page beyond removing its Sign up link; the auth pages get their own change.
- Animation, a theme toggle, and FAQ, pricing or footer sections.
- Deleting `template.png`, which `README.md:3` still uses.

## Implementation Approach

Follow the `/10x-ui` order, with entry points first because they can be checked before any visuals exist. Replace the starter components instead of restyling them, because almost none of their content survives. Keep the page static and server-rendered, with no React islands, so it adds no client JavaScript.

## Critical Implementation Details

- **Redirect only the exact path.** Match `pathname === "/"` in the middleware, not a prefix, because every path starts with `/`.
- **Truthful example.** The product preview uses invented sample numbers, so it must be labelled as an example and must not imply a real rower or a promised result. It may only show things the shipped product produces.
- **`--coach` stays reserved.** On this page it appears only on the example's coach suggestion, which is the role it exists for.

## Phase 1: Entry points

### Overview

Route people correctly before changing how anything looks.

### Changes Required:

#### 1. Signed-in redirect

**File**: `src/middleware.ts`

**Intent**: Send signed-in rowers from `/` to their dashboard, removing a click on every daily visit.

**Contract**: After the user is resolved, a request for exactly `/` with a user present gets `302 /dashboard`. Signed-out requests and every other path are unchanged. If the user cannot be resolved, the visitor sees the landing page.

#### 2. Sign-up link

**File**: `src/pages/auth/signin.astro`

**Intent**: Stop advertising a sign-up that ends in a limited experience.

**Contract**: Remove the Sign up link and its surrounding prompt (`:17` area). `/auth/signup` and `/api/auth/signup` are unchanged; the smoke run still signs up through the API.

#### 3. Description tag

**File**: `src/layouts/Layout.astro`

**Intent**: Say what the product is in search results and link previews.

**Contract**: Optional `description` prop with a default rowing description, rendered as `<meta name="description">`.

#### 4. Smoke cases

**File**: `scripts/smoke.mjs`

**Intent**: Pin the new routing.

**Contract**: After sign-in, `GET /` expects `302` to `/dashboard`. After sign-out, `GET /` expects `200`. The existing anonymous "home renders" step stays.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes
- `npm test` passes
- `npm run build` succeeds
- `grep -c "auth/signup" src/pages/auth/signin.astro` returns 0
- `scripts/smoke.mjs` contains the signed-in `/` → `/dashboard` and signed-out `/` → `200` cases

#### Manual Verification:

- Signed in, opening `/` lands on `/dashboard`
- Signed out, opening `/` shows a page and does not loop
- `/auth/signup` still opens by direct link, and `/auth/signin` no longer links to it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Display font and tokens

### Overview

Add the one approved dependency and publish it as a token (proposed, scoped and decided by the user, as `/10x-ui` requires).

### Changes Required:

#### 1. Font dependency

**File**: `package.json`, `package-lock.json`, `src/pages/index.astro`

**Intent**: Self-host a distinctive display face for this page only.

**Contract**: Add `@fontsource-variable/archivo`; import its `wght.css` from `index.astro` only.

#### 2. Font token

**File**: `src/styles/global.css`

**Intent**: Reference the face by role, so the next view doesn't hardcode a font name.

**Contract**: A family value with a system fallback lives in `:root`, and `@theme inline` publishes it as `--font-display`, which creates the `font-display` utility. No other token changes.

#### 3. Token deposit

**File**: `context/changes/ui-landing-page/tokens.md` (new)

**Intent**: Keep the choice and its reasons outside the chat.

**Contract**: Font name, version, licence and file size; why it is landing-only; the colour tokens used, with a pointer to `context/archive/2026-10-13-ui-rowing-theme-dashboard/tokens.md`; a contrast log filled in Phase 4.

### Success Criteria:

#### Automated Verification:

- `--font-display` is published in `@theme inline` and no raw font name appears inside that block
- `@fontsource-variable/archivo` is the only new entry in `package.json` dependencies
- `npm run build` succeeds and `dist` contains an Archivo `.woff2` file
- `context/changes/ui-landing-page/tokens.md` exists

#### Manual Verification:

- Opening `/dashboard` with the browser's network panel open shows no Archivo download

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: Landing view

### Overview

Build the page, then delete the starter.

### Changes Required:

#### 1. Scull motif

**File**: `src/components/landing/ScullMotif.astro` (new)

**Intent**: Carry the rowing first impression with no photography: a hand-drawn side view of a single scull with oars, on water lines.

**Contract**: Inline SVG, decorative (`aria-hidden="true"`), coloured only through token classes and `currentColor`. It must read as a rowing boat at both 1280 px and 390 px.

#### 2. Landing view

**File**: `src/components/landing/LandingView.astro` (new)

**Intent**: The signed-out page, in this order: a small header, the hero, how it works.

**Contract**: Tokens, `Card` and `buttonVariants` only, with `<main>` on the page and headings in order. Headlines use `font-display`; numbers use `tabular-nums`. Sign in is the only action, shown in the header and the hero, both linking to `/auth/signin`. Contents:

- **Header:** the name "Rowing Coach AI" and Sign in.
- **Hero:** headline "Your next session, worked out from your last three."; supporting line "Log an erg or water session and get computed numbers plus one next session, checked against fixed safety limits. Built for masters rowers with a goal and limited time."; the note "Private for now: this coach is used by invitation."; `ScullMotif`.
- **Example:** a `Card` visibly labelled as an example, showing a sample session (pace /500 m, split drift, SPM, DPS against the last three sessions) and a suggestion in the `--coach` colour (for example 6 × 2 min / 2 min rest, with a stroke-rate cap of 32 spm).
- **How it works:** four steps: log the session by typing it in; see computed metrics against your last three sessions of that type; get one next session within fixed safety limits; mark it done or skipped so the next suggestion reflects it.

The implementer may tighten the wording, but may not add claims the shipped product doesn't support or imply that visitors can get coaching.

#### 3. Page and cleanup

**File**: `src/pages/index.astro`, `src/components/Welcome.astro` (delete), `src/components/Topbar.astro` (delete)

**Intent**: Point `/` at the new view and remove the starter so nobody copies it.

**Contract**: `index.astro` renders `LandingView` in `Layout` on `bg-background`, not `bg-cosmic`. No file references `Welcome` or `Topbar` afterwards.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan returns 0 hits on `src/pages/index.astro`, `src/components/landing/LandingView.astro` and `src/components/landing/ScullMotif.astro`
- `src/components/Welcome.astro` and `src/components/Topbar.astro` no longer exist, and `grep -rn "Topbar\|components/Welcome" src` returns no hits
- `grep -ci "astro starter" src/components/landing/LandingView.astro` returns 0
- `npx astro check`, `npm test` and `npm run build` pass

#### Manual Verification:

- At a glance, at 1280 px and 390 px, the page is recognisably about rowing and looks premium
- The example is clearly labelled as an example, and the page says the coach is private
- Sign in is the only action on the page
- Each product claim on the page matches what the app does today

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: States and visual check

### Overview

This is a static page with one real state, so the matrix is mostly reasoned N/As. It is still written down, and the evidence is captured.

### Changes Required:

#### 1. State matrix

**File**: `context/changes/ui-landing-page/states.md` (new)

**Intent**: Show every state or say why it can't occur, as the `/10x-ui` definition of done requires.

**Contract**: The seven states, as follows: default shown; hover shown on Sign in; focus-visible shown with the `--ring` token; disabled N/A (no disabled controls); error N/A (the page loads no data and has no form; sign-in errors stay on `/auth/signin`); empty N/A (static content); loading N/A (server-rendered with no client fetch; the display font must swap without shifting the layout noticeably).

#### 2. Evidence

**File**: `context/changes/ui-landing-page/screenshots/` (new), `context/changes/ui-landing-page/tokens.md`

**Intent**: Keep review evidence and prove readability.

**Contract**: Screenshots of `/` signed out at 1280 px and 390 px. A contrast log for the text pairs this page uses, including `coach-foreground` on `coach`, muted text on background and card, and `ring` on background: text pairs at least 4.5:1, focus ring at least 3:1. Any value change is made in `:root`/`.dark` and recorded.

### Success Criteria:

#### Automated Verification:

- `context/changes/ui-landing-page/states.md` lists all seven states, each shown or N/A with a reason
- `context/changes/ui-landing-page/screenshots/` contains desktop and mobile captures of `/`

#### Manual Verification:

- The contrast log in `tokens.md` shows all listed pairs passing
- Tabbing through the page shows a visible focus ring on every control
- At 390 px there is no horizontal scrolling and the scull motif still reads as a boat
- Layout does not jump noticeably when the font loads

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 5: Guard and close

### Overview

Keep the page on the contract, then prove lint and smoke in CI, since neither can run reliably on this machine.

### Changes Required:

#### 1. Literal scan

**File**: `scripts/ui-literals.mjs`

**Intent**: Stop the landing page drifting back to literals.

**Contract**: Add `src/pages/index.astro`, `src/components/landing/LandingView.astro` and `src/components/landing/ScullMotif.astro` to `ALLOWLIST`.

#### 2. Agent rule

**File**: `AGENTS.md`

**Intent**: Tell the next agent the two new facts.

**Contract**: In `## UI`, state that `font-display` is for the landing page and app pages stay on the system font. Note that signed-in visitors to `/` are redirected, and that sign-up is deliberately not linked because coaching is invite-only.

### Success Criteria:

#### Automated Verification:

- `node scripts/ui-literals.mjs` exits 0 and reports 8 files clean
- Adding `bg-purple-600` to `LandingView.astro` makes `node scripts/ui-literals.mjs` exit 1 with the file and line (then reverted)
- `AGENTS.md` `## UI` mentions `font-display`
- `npm run lint` and `npm run smoke` pass in CI on the pull request

#### Manual Verification:

- After deployment, the production `/` shows the new page when signed out and goes to the dashboard when signed in

**Implementation Note**: After completing this phase, run `/10x-impl-review`. UI findings are triaged by their effect on the user, not skipped as cosmetic.

---

## Testing Strategy

### Unit Tests:

None added. The change is presentational plus one middleware branch, which the smoke run covers against a real build. Existing `npm test` suites must stay green.

### Integration Tests:

Smoke (`scripts/smoke.mjs`), run in CI against a production preview: signed-out `/` renders; signed-in `/` redirects to `/dashboard`; after sign-out `/` renders again; sign-up through the API still works.

### Manual Testing Steps:

1. Open `/` in a private window: new page, Sign in only, private note visible.
2. Sign in: land on `/dashboard`. Open `/` again: back on `/dashboard`.
3. Sign out: land on the new page.
4. Open `/auth/signup` directly: it still works.
5. Check the page at 1280 px and 390 px.

## Performance Considerations

No client JavaScript is added. The page adds a 35 KB font file, fetched only by pages that render it. The motif is inline SVG with no image requests. The redirect uses the user the middleware already resolves, so it adds no extra Supabase call.

## Migration Notes

Rollback is a revert: no data or settings change. `bg-cosmic` loses one usage here; the shim stays until the remaining pages migrate.

## References

- Frame brief: `context/changes/ui-landing-page/frame.md`
- Change notes: `context/changes/ui-landing-page/change.md`
- Token origin: `context/archive/2026-10-13-ui-rowing-theme-dashboard/tokens.md`
- Product claims: `context/foundation/prd.md` (Vision & Problem Statement, US-01, Business Logic, Access Control)
- Middleware pattern: `src/middleware.ts:4-24`
- Smoke sequence: `scripts/smoke.mjs:75`, `:200-201`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Entry points

#### Automated

- [x] 1.1 `npx astro check` passes — 6d1fcca
- [x] 1.2 `npm test` passes — 6d1fcca
- [x] 1.3 `npm run build` succeeds — 6d1fcca
- [x] 1.4 `grep -c "auth/signup" src/pages/auth/signin.astro` returns 0 — 6d1fcca
- [x] 1.5 `scripts/smoke.mjs` contains the signed-in `/` → `/dashboard` and signed-out `/` → `200` cases — 6d1fcca

#### Manual

- [x] 1.6 Signed in, opening `/` lands on `/dashboard` — 6d1fcca
- [x] 1.7 Signed out, opening `/` shows a page and does not loop — 6d1fcca
- [x] 1.8 `/auth/signup` still opens by direct link, and `/auth/signin` no longer links to it — 6d1fcca

### Phase 2: Display font and tokens

#### Automated

- [x] 2.1 `--font-display` is published in `@theme inline` and no raw font name appears inside that block — 6c9c47a
- [x] 2.2 `@fontsource-variable/archivo` is the only new entry in `package.json` dependencies — 6c9c47a
- [x] 2.3 `npm run build` succeeds and `dist` contains an Archivo `.woff2` file — 6c9c47a
- [x] 2.4 `context/changes/ui-landing-page/tokens.md` exists — 6c9c47a

#### Manual

- [ ] 2.5 Opening `/dashboard` with the browser's network panel open shows no Archivo download

### Phase 3: Landing view

#### Automated

- [x] 3.1 Hardcoded-value scan returns 0 hits on `src/pages/index.astro`, `src/components/landing/LandingView.astro` and `src/components/landing/ScullMotif.astro` — 0707969
- [x] 3.2 `src/components/Welcome.astro` and `src/components/Topbar.astro` no longer exist, and `grep -rn "Topbar\|components/Welcome" src` returns no hits — 0707969
- [x] 3.3 `grep -ci "astro starter" src/components/landing/LandingView.astro` returns 0 — 0707969
- [x] 3.4 `npx astro check`, `npm test` and `npm run build` pass — 0707969

#### Manual

- [x] 3.5 At a glance, at 1280 px and 390 px, the page is recognisably about rowing and looks premium — 0707969
- [x] 3.6 The example is clearly labelled as an example, and the page says the coach is private — 0707969
- [x] 3.7 Sign in is the only action on the page — 0707969
- [x] 3.8 Each product claim on the page matches what the app does today — 0707969

### Phase 4: States and visual check

#### Automated

- [x] 4.1 `context/changes/ui-landing-page/states.md` lists all seven states, each shown or N/A with a reason
- [x] 4.2 `context/changes/ui-landing-page/screenshots/` contains desktop and mobile captures of `/`

#### Manual

- [x] 4.3 The contrast log in `tokens.md` shows all listed pairs passing
- [x] 4.4 Tabbing through the page shows a visible focus ring on every control
- [x] 4.5 At 390 px there is no horizontal scrolling and the scull motif still reads as a boat
- [x] 4.6 Layout does not jump noticeably when the font loads

### Phase 5: Guard and close

#### Automated

- [ ] 5.1 `node scripts/ui-literals.mjs` exits 0 and reports 8 files clean
- [ ] 5.2 Adding `bg-purple-600` to `LandingView.astro` makes `node scripts/ui-literals.mjs` exit 1 with the file and line (then reverted)
- [ ] 5.3 `AGENTS.md` `## UI` mentions `font-display`
- [ ] 5.4 `npm run lint` and `npm run smoke` pass in CI on the pull request

#### Manual

- [ ] 5.5 After deployment, the production `/` shows the new page when signed out and goes to the dashboard when signed in
