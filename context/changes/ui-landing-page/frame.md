# Frame Brief: Landing page

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

`/` still renders the starter demo: "10x Astro Starter", purple orbs and starfield, "Sign In / Sign Up" even for signed-in visitors, and starter feature cards.

## Initial Framing (preserved)

- **User's stated cause or approach**: "Make an attractive landing page for the best rowing coach AI website in the world": the problem is how the page looks.
- **User's proposed direction**: Restyle the landing page with the new Erg & Water design.
- **Pre-dispatch narrowing**: What bothers the user most is that the page "says nothing about rowing". It is for new visitors and existing rowers "both equally". "Attractive" is judged by first impression (premium and rowing-specific at a glance).

## Dimension Map

The observation could originate at any of these dimensions:

1. **Content and story**: the page has no product message.
2. **Visual system**: hardcoded starter styling instead of the tokens. ← initial framing
3. **Signed-in entry**: what `/` offers people who already have an account.
4. **First-impression assets**: whether the repo has anything to build a rowing first impression from.
5. **What a new visitor actually gets**: whether the product can deliver what a public pitch would promise. (Surfaced during investigation; not in the original map.)

## Hypothesis Investigation

| Hypothesis                                                       | Evidence                                                                                                                                                                                                                                                                                                                                         | Verdict                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Content: no product message, and material exists to write one    | Every visible line of `src/components/Welcome.astro` is about the starter (`:23`, feature cards). `context/foundation/prd.md` "Vision & Problem Statement" and "Success Criteria" give the pitch; roadmap slices S-01 to S-05 are all `done`, so the core loop can be stated truthfully.                                                         | STRONG                                        |
| Visual system: restyling fixes the observation (initial framing) | 20 literal-scan lines in `Welcome.astro`, 7 in `Topbar.astro`; tokens and components are ready. A restyle alone leaves the starter copy, so "says nothing about rowing" would remain.                                                                                                                                                            | WEAK as root cause; necessary, not sufficient |
| Signed-in entry: rowers reach `/` and get the wrong options      | Nothing links to `/` except `src/pages/api/auth/signout.ts:9`; sign-in goes to `/dashboard` (`signin.ts:19`), as does the AppNav brand link. But the user reports they and their partner open the app **via the root URL**, where the hero always offers Sign In / Sign Up (`Welcome.astro:30-39`) regardless of session.                        | STRONG, given the reported habit              |
| Assets: no rowing visuals to build on                            | `public/` holds only `favicon.png` (32×32) and `template.png` (the "10x-astro-starter" space-rocket banner, used by `README.md:3`). No logo or wordmark. System font by decision (archived `ui-rowing-theme-dashboard` plan brief). `src/layouts/Layout.astro` has no description or social-share tags. User confirms no rowing imagery exists.  | STRONG                                        |
| Promise vs. access: a public pitch would over-promise            | Sign-up is open (`prd.md` "Access Control"), but AI suggestions run only for `COACH_EMAILS` (`src/lib/services/coaching/allowlist.ts:20`); anyone else gets a safe default labelled "Personal coaching is not enabled for this account" (`src/components/sessions/SuggestionPanel.tsx:33`). User confirms production lists only the two of them. | STRONG                                        |

## Narrowing Signals

- Production `COACH_EMAILS` holds only the user and their partner, so a stranger who signs up today does not get AI coaching.
- The user's position on opening to strangers: **"Private, but impressive"**. It stays for them and a few people; the page should look great and represent the project.
- The user and their partner normally open the app **via the root URL**, so the two real daily users hit `/` routinely.
- **No rowing imagery or logo exists**, so the first impression cannot rest on photography that the project already owns.

Together these revise the pre-dispatch "both equally": the people the page serves in practice are two signed-in rowers on every visit, plus occasional visitors who are shown the project but cannot get coaching.

## Cross-System Convention

The repo's prior decisions match the reframe: `context/archive/2026-10-08-first-session-suggestion/plan-brief.md:31` records `COACH_EMAILS` plus a spend limit as the cost guard "for a family-only MVP". PRD Open Question 1 (open sign-up vs. AI usage cost) is still unanswered. The PRD, shape notes and roadmap contain no mention of a landing or marketing page, so no prior decision conflicts.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: `/` is the daily front door of a private, family-only coach, yet it presents an unrelated starter kit and treats everyone as a stranger, so it neither gets its two real users into the app nor truthfully shows anyone else what this product is.

The initial framing is partly right: the page does need the new design, and first impression remains the user's test. But "attractive" sits on top of three things a restyle does not settle: what the page says, what it does for someone already signed in, and what it may promise a visitor who cannot get coaching. It also has to make a rowing-specific first impression with no photography or logo to draw on.

The ambition "best rowing coach AI website in the world" stays as the quality bar for how the page looks and reads, not as a claim that strangers can use the coach today.

## Confidence

- **HIGH**: strong evidence in the code, a matching prior decision, and decisive answers from the user.

One unverified item: production sign-up settings. `prd.md` says sign-up is open and `supabase/config.toml` enables it locally, but the production Supabase project was not inspected. This does not change the problem statement.

## What Changes for /10x-plan

The plan is about the page's job for two audiences, not only a token restyle: signed-in rowers need a way into the app from `/`, and any visitor-facing message must be truthful about private access. Questions for the plan to settle: what the page offers a stranger who can't get coaching (including how it treats the Sign Up action), and how to create a rowing first impression without existing imagery.

Out of this change's scope unless the user decides otherwise: opening coaching to strangers and PRD Open Question 1.

## References

- Source files: `src/components/Welcome.astro:23`, `:30-39`; `src/components/Topbar.astro`; `src/pages/index.astro`; `src/pages/api/auth/signout.ts:9`; `src/pages/api/auth/signin.ts:19`; `src/lib/services/coaching/allowlist.ts:20`; `src/components/sessions/SuggestionPanel.tsx:33`; `src/layouts/Layout.astro`; `public/`
- Product: `context/foundation/prd.md` (Vision & Problem Statement, Access Control, Open Questions), `context/foundation/roadmap.md`
- Prior decisions: `context/archive/2026-10-08-first-session-suggestion/plan-brief.md:31`, `context/archive/2026-10-13-ui-rowing-theme-dashboard/plan-brief.md`, `context/archive/2026-10-13-ui-rowing-theme-dashboard/tokens.md`
- Related research: none yet (`context/changes/ui-landing-page/research.md` does not exist)
- Investigation: the three delegated checks stopped at a session limit and returned nothing; all evidence above was gathered directly in the main session.
