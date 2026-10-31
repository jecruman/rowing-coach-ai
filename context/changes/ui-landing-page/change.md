---
change_id: ui-landing-page
title: Ui landing page
status: implementing
created: 2026-10-14
updated: 2026-10-31
archived_at: null
---

## Notes

UI change run through `/10x-ui`; follow-up to the archived `ui-rowing-theme-dashboard`.

- **View:** `/` (`src/pages/index.astro` → `src/components/Welcome.astro`, header `src/components/Topbar.astro`) — still the starter's "10x Astro Starter" demo.
- **Token source:** `src/styles/global.css` (Erg & Water, dark-first; `--coach` reserved for the coach's suggestion), values and rationale in `context/archive/2026-10-13-ui-rowing-theme-dashboard/tokens.md`. Components in `src/components/ui` (`button`, `card`); rules in `AGENTS.md` `## UI`.
- **Contract variant:** existing design system — extend it, no new palette. Pre-audit literal-scan hits: `Welcome.astro` 20, `Topbar.astro` 7, `index.astro` 0.
