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
- `src/components/`: Astro for static UI, React only for interactivity; hooks in `src/components/hooks/`; shadcn/ui in `src/components/ui/` (`npx shadcn@latest add <name>`).
- `src/lib/` helpers, `src/lib/services/` business logic, `src/types.ts` shared entities and DTOs.
- `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`.
- `context/foundation/`: PRD, shape notes (`## Forward:` blocks = technical roadmap), tech stack.

## Coding style

- Import via the `@/*` alias. Merge classes with `cn()` from `@/lib/utils`; no manual class-string concatenation. No `"use client"` directives.

## Testing

- No unit-test runner is configured; `npm run smoke` is the only automated check. Acceptance criteria to cover are in US-01 of the PRD.

## CI and environment

- @.github/workflows/ci.yml runs lint, `astro check`, build and the smoke test against local Supabase on every push and PR to `main`.
- Commit convention is not yet established (single initial commit). Starter reference notes: @CLAUDE.md.scaffold.
