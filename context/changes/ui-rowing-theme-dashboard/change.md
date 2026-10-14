---
change_id: ui-rowing-theme-dashboard
title: Rowing theme tokens and a token-built dashboard
status: impl_reviewed
created: 2026-10-13
updated: 2026-10-14
archived_at: null
---

## Notes

UI change run through `/10x-ui`.

- **View:** `/dashboard` (`src/pages/dashboard.astro`) — the first screen after sign-in. Includes the shared app shell/navigation it needs; other views are follow-up changes (`ui-landing-page`, then per-view sweeps).
- **Token source:** `src/styles/global.css` — shadcn/ui on Tailwind v4 (`:root` / `.dark` values published via `@theme inline`). Components in `src/components/ui` (add via `npx shadcn@latest add <name>`).
- **Contract variant:** fresh starter with a dead token file — tokens exist, zero views read them (0 token-class usages across 24 view files; ~190 literal hits). Phase 1 is making the view read tokens; only then pick new values.
- **Motif:** "Erg & Water" — river-teal primary, light surfaces for data, buoy-orange accent reserved for the coach's suggestion, deep navy-water dark theme, tabular numerals for splits/pace. Replaces the starter's purple `bg-cosmic`.

Pre-audit charges (to be confirmed in research):

1. `src/styles/global.css:113` — `bg-cosmic` hardcodes hex; every page reads it instead of `--background`.
2. `src/pages/dashboard.astro:55`, `:69` (+ 6 more sites) — hand-rolled purple `<a>` buttons shadow `src/components/ui/button.tsx`.
3. `src/components/auth/ServerError.tsx:11`, `FormField.tsx:65` — red literals instead of `destructive`.
4. `src/pages/dashboard.astro:40` — dashboard is a lone centred card with its own sign-out; no shared app shell, nav differs per page.
5. `AGENTS.md:21` — no rule about tokens / no literal colours; why views drifted.
