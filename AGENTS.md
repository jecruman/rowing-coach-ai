# Repository Guidelines

Rowing Coach AI: rowers log erg and water sessions and get one suggested next session. Astro 7 SSR with React 19 islands, TypeScript, Tailwind 4 and Supabase (auth + Postgres), deployed to Cloudflare. Product scope lives in @context/foundation/prd.md.

## Hard rules

- Every new Supabase table enables RLS with per-operation, per-role policies; no user may read or write another user's rows.
- Session metrics (baseline = average of the last 3 sessions of the same type) and the three safety limits are computed in TypeScript under `src/lib/services/`, never by the model. A suggestion that breaks a limit is never shown: retry once, then show the safe default (see @context/foundation/prd.md, Business Logic).
- Server secrets are declared in `env.schema` in @astro.config.mjs and read via `astro:env/server`; values go in `.env` / `.dev.vars` only.
- Never write to `context/archive/`.

## Commands

- npm scripts (dev, build, preview, lint, format, smoke): @package.json.
- `npx supabase start` — local Supabase (needs Docker).

## Project structure

- `src/pages/` routes; `src/pages/api/**` endpoints validate input with zod.
- `src/middleware.ts` gates pages listed in `PROTECTED_ROUTES`; add every new signed-in page there.
- `src/components/`: Astro for static UI, React only for interactivity; hooks in `src/components/hooks/`; shadcn/ui in `src/components/ui/` (see UI).
- `src/lib/` helpers, `src/lib/services/` business logic, `src/types.ts` shared entities and DTOs.
- `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`.
- `context/foundation/`: PRD, shape notes (`## Forward:` blocks = technical roadmap), tech stack.

## Coding style

- Import via the `@/*` alias. Merge classes with `cn()` from `@/lib/utils`; no manual class-string concatenation. No `"use client"` directives.

## UI

- Tokens live in `src/styles/global.css`: values in `:root` / `.dark`, published to Tailwind via `@theme inline`. Origin and rationale: the `ui-rowing-theme-dashboard` change's `tokens.md`.
- Views use role tokens only (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, ...). No literal colours, palette classes (`bg-purple-600`) or arbitrary values (`p-[13px]`); a missing role is added as a token, not inlined.
- `--coach` is reserved for the coach's suggestion; `accent` is a hover tint, never the suggestion colour.
- `bg-cosmic` is a migration shim for not-yet-migrated pages — never use it in new views.
- Check `src/components/ui/` before creating a component; add missing ones with `npx shadcn@latest add <name>`.
- `<a>` styled as a button in Astro uses `buttonVariants` from `@/components/ui/button`.
- Signed-in pages render `AppNav`.
- Kitchen sink at `/dev/kitchen-sink` (dev only) shows every token and component — check it after changing either.
- `npm run lint` also runs `scripts/ui-literals.mjs`, a literal scan over an allowlist of migrated files; add a view to that allowlist in the same change that migrates it.

## Testing

- `npm test` runs Vitest (via Astro's `getViteConfig`); put `*.test.ts` next to the code they test. Fake external clients — no real model or network calls in unit tests.
- `npm run smoke` (auth, profile and goal flows over HTTP) and `npm run rls-check` (cross-user access rules on a real database) need a running app / local Supabase; CI runs both in the `smoke` job.
- New tables need an `rls-check` step proving another user can't read or change their rows.

## CI and environment

- @.github/workflows/ci.yml runs lint, `astro check`, build and the smoke test against local Supabase on every push and PR to `main`.
- Commit convention is not yet established (single initial commit). Starter reference notes: @CLAUDE.md.scaffold.
