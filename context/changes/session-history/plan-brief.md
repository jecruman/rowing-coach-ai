# Session History — Plan Brief

> Full plan: `context/changes/session-history/plan.md`

## What & Why

Roadmap S-03 (Linear JES-14, PRD FR-006, must-have): the rower can view, edit and delete their logged sessions. Today a mistyped distance or a duplicate log is permanent and older sessions are unreachable, which corrupts the baseline every later analysis and suggestion depends on.

## Starting Point

S-02 shipped `sessions` and `coach_suggestions` with RLS, including owner update/delete policies, an `updated_at` trigger and `on delete cascade` from suggestion to session. Stored suggestions are immutable and not user-deletable (cost guard). There is no list, edit or delete UI; the dashboard links only the latest session.

## Desired End State

From the dashboard the rower opens `/sessions`, a paged newest-first list. Any session can be opened, edited in the familiar log form (type locked) or deleted after an inline confirm. If a session is edited after its suggestion was made, the page says "Suggested before you edited this session"; the suggestion itself is kept as a snapshot.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Suggestion after an edit | Keep it; show "Suggested before you edited this session" when `updated_at` > suggestion `created_at` | Keeps the no-regenerate cost guard and honest history with no migration |
| No-op save | Endpoint skips the UPDATE when values are unchanged | The trigger bumps `updated_at` on every write, which would falsely mark stale |
| Editable fields | All except session type; type enforced server-side | Reuses `SessionForm` and `SessionInputSchema` without clearing type-specific fields |
| List | `/sessions`, 20 per page, newest first, date/type/distance/time/pace | Stays fast as history grows; matches the existing index and order |
| Delete UX | Inline "Delete this session and its suggestion? Delete / Cancel", redirect with notice | Phone-friendly, explicit about losing the suggestion, no soft-delete machinery |
| Schema | No migration at first; review F1 added one nullable column `coach_suggestions.session_updated_at` | An edit saved while a suggestion is generating must still mark it as made before the edit |

## Scope

**In scope:** paged list page; dashboard/session links; edit page + update endpoint; form edit mode; stale note; delete control + endpoint; unit tests, rls-check and smoke steps.

**Out of scope:** changing session type; regenerating/discarding suggestions; soft delete/undo; done/skipped (S-04); trends (S-05); filters, search, bulk actions.

## Architecture / Approach

Same pattern as logging: Astro pages + React form islands posting real HTML forms → API routes validate with zod → 302 redirects with `?error=` or notice params. `GET /sessions?page=N` (new loader `loadSessionsPage`), `GET /sessions/<id>/edit` → `POST /api/sessions/<id>`, `POST /api/sessions/<id>/delete`. Staleness is derived on render, never stored.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session list and navigation | `/sessions` with paging, links from dashboard and session page | Paging off-by-one |
| 2. Edit session | Prefilled locked-type form, update endpoint, stale note | Form-value round trip (ranges, splits) causing false "changed" |
| 3. Delete session | Inline confirm, delete endpoint, list notice, RLS cascade proof | rls-check step ordering vs existing "unchanged" checks |

**Prerequisites:** S-02 done (yes); local server with Supabase for smoke/rls-check.
**Estimated effort:** ~2 sessions; phases are small and follow existing patterns — a good candidate for `/goal` or `claude -p` in its own worktree.

## Open Risks & Assumptions

- A typo fix leaves the stored suggestion based on the old numbers until the next session — accepted; the note makes it visible.
- S-04 (done/skipped) will add state to suggestions; deleting a session will cascade that state too. Assumed acceptable; revisit in S-04 planning.

## Success Criteria (Summary)

- The rower can find any past session, fix a value, and see the corrected analysis.
- A deleted session disappears everywhere, with its suggestion, after an explicit confirm.
- No edit or delete ever triggers an extra model call.
