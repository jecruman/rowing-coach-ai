# Follow-ups from the implementation review

## F9: cache headers and auth timeout (open a separate change)

Not fixed in this change. Pre-existing, low risk today, and it applies to every route, so it deserves its own review. Start with `/10x-new`.

- `src/lib/supabase.ts:14`: `setAll` discards the no-store headers `@supabase/ssr` provides. Apply them.
- `src/middleware.ts:24-26`: set `Cache-Control: private, no-store` on the `/` redirect, since `/` now varies by session.
- `src/middleware.ts:10-13`: `getUser` has no timeout and its error is ignored, so a slow Supabase stalls signed-in visits and an error shows a signed-in rower the landing page with nothing logged. Log non-session errors and consider a fetch timeout.

Check first: the Cloudflare zone's cache settings, which aren't visible from the repo. A "Cache Everything" rule would raise the risk.

## Supabase CLI v3 (open a separate change)

CI was pinned to CLI `2.117.0` on 2026-11-02, because `version: latest` picked up v3.0.0 that day and `supabase start` failed: "`[inbucket]` in supabase/config.toml is no longer supported. Use `[local_smtp]` instead." To move to v3, migrate `supabase/config.toml`, update the `supabase` dev dependency, read the v3 release notes for other breaking changes, and remove the pin from `.github/workflows/ci.yml`.
