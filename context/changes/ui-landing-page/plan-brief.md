# Landing page — Plan Brief

> Full plan: `context/changes/ui-landing-page/plan.md`
> Frame brief: `context/changes/ui-landing-page/frame.md`

## What & Why

The actual problem to plan around is: `/` is the daily front door of a private, family-only coach, yet it presents an unrelated starter kit and treats everyone as a stranger, so it neither gets its two real users into the app nor truthfully shows anyone else what this product is.

## Starting Point

`/` renders `Welcome.astro`, the starter's demo page, with `Topbar.astro`. It offers Sign In / Sign Up to everyone. Only two emails get AI coaching, and no rowing imagery or logo exists. The Erg & Water tokens and shared components from the dashboard change are ready to use.

## Desired End State

Signed-in rowers opening `/` land on their dashboard. Signed-out visitors see a page that is recognisably about rowing at a glance, says the coach is private, shows a labelled example of the product, and explains how it works, with Sign in as the only action. The starter components are gone.

## Key Decisions Made

| Decision           | Choice                                                                        | Why (1 sentence)                                                                | Source |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| Audience position  | Private, but impressive                                                       | The coach stays for the owner and a few people; the page represents the project | Frame  |
| Signed in at `/`   | Redirect to `/dashboard`, in the middleware                                   | Removes a click on every daily visit; a page-level `return` crashes ESLint here | Plan   |
| Strangers          | Page says private; Sign up links removed; `/auth/signup` works by direct link | Promises nothing a visitor won't get, while invites still work                  | Plan   |
| Registration       | Not closed; production auth settings untouched                                | A page-design change shouldn't alter auth; the PRD's open question stays open   | Plan   |
| Rowing visual      | Token-built, labelled product example plus a hand-drawn SVG scull             | Shows what the product does, with no licensing or image weight                  | Plan   |
| Page depth         | Hero plus a four-step how it works                                            | Matches the shipped loop without over-selling a private tool                    | Plan   |
| Typography         | Archivo (35 KB, OFL) as `--font-display`, on this page only                   | Type carries the first impression; app pages keep the system font               | Plan   |
| Starter components | Delete `Welcome.astro` and `Topbar.astro`                                     | Nothing else uses them, and almost none of their content survives               | Plan   |
| Lint and smoke     | One CI row in Phase 5                                                         | Neither runs reliably on this machine, so per-phase rows would just stay open   | Plan   |

## Scope

**In scope:**

- Middleware redirect, Sign up link removal, description tag, smoke cases
- Archivo font and `--font-display` token
- `LandingView.astro`, `ScullMotif.astro`, deletion of the starter components
- State matrix, screenshots, contrast log
- Literal-scan allowlist and `AGENTS.md` update

**Out of scope:**

- Opening coaching to strangers, closing registration, a waitlist
- Photography, a designed logo, a new favicon, social-share images
- Restyling the auth pages or other app pages; animation; FAQ, pricing or footer sections

## Architecture / Approach

The middleware already resolves the user on every request, so it handles the redirect for exactly `/`. `index.astro` imports the font and renders a static `LandingView`, which adds no client JavaScript and reads only tokens and repo components. `ScullMotif` is decorative inline SVG coloured through tokens. `--coach` appears only on the example's suggestion.

## Phases at a Glance

| Phase                      | What it delivers                                             | Key risk                                 |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| 1. Entry points            | Signed-in redirect, Sign up link removed, description, smoke | Matching more than the exact path `/`    |
| 2. Display font and tokens | Archivo dependency, `--font-display`, `tokens.md`            | Font reaching app pages                  |
| 3. Landing view            | Motif, hero, labelled example, how it works; starter deleted | The hand-drawn scull not looking premium |
| 4. States and visual check | Seven-state matrix, screenshots, contrast log                | Layout jump when the font loads          |
| 5. Guard and close         | Allowlist, `AGENTS.md`, CI lint and smoke, production check  | Copy drifting from what the product does |

**Prerequisites:** Update local `main` and branch from it (`ui-landing-page`); PR #4 is already merged.
**Estimated effort:** ~2 sessions across 5 phases.

## Open Risks & Assumptions

- The scull is hand-authored SVG, so its quality can only be judged by eye. If it doesn't look premium in Phase 3, the page must not ship on it; simplify or rethink the motif at that point.
- Someone who finds `/auth/signup` can still register and gets the safe default, as today. This is accepted and recorded under What We're NOT Doing.
- Production sign-up settings were not inspected, as noted in the frame brief. No step depends on them.
- The sample numbers in the example are invented, so they must stay labelled as an example.

## Success Criteria (Summary)

- You open `/` signed in and are on your dashboard with no extra click.
- A visitor knows at a glance this is a rowing coach, and that it's private.
- Lint fails if the landing page gains a literal colour, and the starter is gone.
