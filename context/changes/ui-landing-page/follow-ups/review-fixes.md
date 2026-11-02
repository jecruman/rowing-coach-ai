# Follow-ups from the implementation review

## F9: cache headers and auth timeout (open a separate change)

Not fixed in this change. Pre-existing, low risk today, and it applies to every route, so it deserves its own review. Start with `/10x-new`.

- `src/lib/supabase.ts:14`: `setAll` discards the no-store headers `@supabase/ssr` provides. Apply them.
- `src/middleware.ts:24-26`: set `Cache-Control: private, no-store` on the `/` redirect, since `/` now varies by session.
- `src/middleware.ts:10-13`: `getUser` has no timeout and its error is ignored, so a slow Supabase stalls signed-in visits and an error shows a signed-in rower the landing page with nothing logged. Log non-session errors and consider a fetch timeout.

Check first: the Cloudflare zone's cache settings, which aren't visible from the repo. A "Cache Everything" rule would raise the risk.
