# Session History Implementation Plan

## Overview

Roadmap S-03 (Linear JES-14, PRD FR-006): the rower can view, edit and delete their logged sessions. Adds a paged session list, an edit flow that reuses the log form, and a confirmed delete. No schema change: S-02 already shipped the update/delete RLS policies, the `updated_at` trigger and the suggestion cascade.

## Current State Analysis

- `sessions` has `sessions_update_own` / `sessions_delete_own` policies and a `sessions_set_updated_at` trigger (`supabase/migrations/20261008200000_create_sessions_and_suggestions.sql:55-66`). `coach_suggestions.session_id` is `on delete cascade` (same file, line 74).
- Stored suggestions are immutable and cannot be deleted by the user (`20261008220000_coach_suggestions_no_delete.sql`) — the cost guard against "delete and ask again". This plan keeps that guard intact.
- Analysis on `/sessions/[id]` is recomputed on every render from `loadSessionsUpTo` (`src/pages/sessions/[id].astro:39-50`), and new suggestions are built from fresh history in `src/pages/api/sessions/[id]/suggestion.ts`. Only the one stored suggestion per session can go stale after an edit.
- There is no session list: the dashboard links only the latest session (`src/pages/dashboard.astro:73-78`).
- Log flow: `SessionForm.tsx` posts a form to `POST /api/sessions` (`src/pages/api/sessions.ts`), validated by `SessionInputSchema` (`src/lib/services/sessions/rules.ts:206`), then redirects. Errors come back as `?error=` (`src/pages/sessions/new.astro`).
- `/sessions*` is already protected by middleware (`src/middleware.ts:4`); `/api/*` handlers check `locals.user` themselves.
- rls-check already proves B cannot update or delete A's session (`scripts/rls-check.mjs:242-272`).

## Desired End State

- `/sessions` lists the rower's sessions newest first (`rowed_on` desc, then `created_at` desc), 20 per page, each row showing date, type, distance, time and pace /500 m and linking to the session page; an "Older" / "Newer" link pages through history. Dashboard and session page link to it.
- `/sessions/<id>/edit` shows the log form prefilled with the session's values, erg/water toggle locked. Saving updates the session and returns to its page; validation errors return to the edit page.
- When a session was edited after its suggestion was stored, the session page shows "Suggested before you edited this session" next to the suggestion. Saving without changing any value does not mark it.
- The session page offers "Delete session" → inline "Delete this session and its suggestion? Delete / Cancel"; confirming deletes it (suggestion goes via cascade) and lands on `/sessions` with a "Session deleted" notice.

Verify via unit tests, `npm run rls-check`, `npm run smoke` and the manual steps below.

### Key Discoveries:

- `loadSession` / `toRowingSession` map exactly `SESSION_COLUMNS` (`src/lib/services/sessions/load.ts:9-10, 53-70`); adding `updated_at` there is the single place to expose it.
- `loadStoredSuggestion` already returns `createdAt` (`load.ts:168`).
- `metrics.ts` uses `pacePer500` from `src/lib/services/profile/rules.ts`; `formatTime` lives there too — reuse both for list rows and form prefill.
- `HISTORY_LIMIT` / "latest" ordering is the agreed order used everywhere (`sessions_user_rowed_on_idx`).

## What We're NOT Doing

- Changing a session's type (erg ↔ water); delete and re-log instead.
- Regenerating, discarding or editing a stored suggestion after a session edit; the suggestion is a snapshot.
- Soft delete / undo; no migrations at all.
- Done/skipped marks (S-04), metric trends (S-05), filtering or search in the list.
- Bulk delete, CSV export.

## Implementation Approach

Follow the existing form-POST → redirect pattern: pages are Astro, forms are React islands that post real HTML forms, API routes validate with the existing zod schema and redirect with `?error=` / notice params. Reuse `SessionForm` in an "edit" mode rather than building a second form. Staleness is derived (`session.updatedAt > suggestion.createdAt`), not stored. Ship in three slices — list, edit, delete — each independently verifiable.

## Critical Implementation Details

- **No-op edits must not write.** The `updated_at` trigger fires on every UPDATE, so the edit endpoint compares the normalised input with the stored row and skips the update when nothing changed; otherwise a plain "Save" would mark the suggestion stale.
- **Type is enforced on the server.** The locked toggle is UI only; `POST /api/sessions/[id]` rejects input whose `sessionType` differs from the stored session.

## Phase 1: Session list and navigation

### Overview

A paged `/sessions` page and links to it.

### Changes Required:

#### 1. Paged session loader

**File**: `src/lib/services/sessions/load.ts`

**Intent**: Read one page of the signed-in rower's sessions in the agreed order, telling the caller whether older sessions exist.

**Contract**: `loadSessionsPage(supabase, page: number, pageSize = 20): Promise<{ sessions: RowingSession[]; hasOlder: boolean; loadFailed: boolean }>` — orders by `rowed_on` desc, `created_at` desc; uses `.range()` and fetches `pageSize + 1` rows to compute `hasOlder`. Page is 1-based; invalid/negative values are treated as 1 by the page.

#### 2. List page

**File**: `src/pages/sessions/index.astro` (new)

**Intent**: Show the page of sessions in the existing card style; each row links to `/sessions/<id>` and shows date, Erg/Water, distance, time (`formatTime`) and pace /500 m (`pacePer500` + `formatTime`). Empty state links to `/sessions/new`; a load failure shows `ServerError`. "Newer" / "Older" links via `?page=N`. Shows a "Session deleted" notice when `?deleted=1` (used in phase 3).

**Contract**: route `GET /sessions?page=N[&deleted=1]`.

#### 3. Navigation

**Files**: `src/pages/dashboard.astro`, `src/pages/sessions/[id].astro`

**Intent**: Add an "All sessions" link on the dashboard (next to the latest-session link) and on the session page.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Add steps: anonymous `GET /sessions` redirects to sign-in; signed-in `GET /sessions` returns 200 and its body contains the smoke session's link.

### Success Criteria:

#### Automated Verification:

- Type check and build pass: `npm run build`
- Lint passes (ignoring CRLF "Delete ␍" noise): `npm run lint`
- Unit tests pass: `npm test`
- Smoke passes against a local server, including the new list steps: `npm run smoke`

#### Manual Verification:

- On a phone-width browser, `/sessions` lists sessions newest first with date, type, distance, time and pace, and each row opens the right session
- With more than 20 sessions (or `pageSize` temporarily lowered), "Older" and "Newer" page correctly and the first page has no "Newer" link
- Dashboard and session page "All sessions" links work

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Edit session

### Overview

Prefilled edit form, update endpoint with no-op detection and server-side type lock, and the stale-suggestion note.

### Changes Required:

#### 1. Expose `updatedAt`

**Files**: `src/lib/services/sessions/load.ts`, `src/types.ts`

**Intent**: Add `updated_at` to `SESSION_COLUMNS` / `SessionRow` and `updatedAt: string` to `RowingSession`, so pages can compare it with the suggestion's `createdAt`. Update test fixtures that build `RowingSession` objects.

**Contract**: `RowingSession.updatedAt` (ISO timestamp).

#### 2. Form values ↔ session helpers

**File**: `src/lib/services/sessions/rules.ts` (+ `rules.test.ts`)

**Intent**: Convert a stored session into the form's string values (time via `formatTime`, splits joined with spaces, ranges as `"20-24"` or a single value when min = max), and decide whether a parsed `SessionInput` differs from the stored session. Round-trip property: `SessionInputSchema.parse(toFormValues(session))` equals the session's values, so an untouched edit form is a no-op.

**Contract**: `toSessionFormValues(session: RowingSession): Record<Field, string>`; `sessionInputChanged(stored: RowingSession, input: SessionInput): boolean`.

#### 3. Edit mode in `SessionForm`

**File**: `src/components/sessions/SessionForm.tsx`

**Intent**: Accept optional initial values, a form `action` and a locked session type; in edit mode the type toggle is disabled (the value is still submitted via a hidden input), the date is not replaced by the local date on mount, and the submit label reads "Save changes". Log mode behaves exactly as today.

**Contract**: props `{ today: string; initial?: SessionFormValues; action?: string; lockType?: boolean }`; default `action = "/api/sessions"`.

#### 4. Edit page

**File**: `src/pages/sessions/[id]/edit.astro` (new)

**Intent**: Load the session (404 / 500 handling as on the session page), render `SessionForm` in edit mode posting to `/api/sessions/<id>`, show `?error=` like `new.astro`, and a "Cancel" link back to the session.

**Contract**: route `GET /sessions/<id>/edit[?error=…]`.

#### 5. Update endpoint

**File**: `src/pages/api/sessions/[id].ts` (new)

**Intent**: Signed-in only; load the session (not found → redirect to `/sessions`); parse the form with `SessionInputSchema`; reject a type change with "Session type can't be changed — delete and log it again"; if `sessionInputChanged` is false redirect to the session without writing; else update the same columns as the insert and redirect to `/sessions/<id>`. Errors redirect to `/sessions/<id>/edit?error=…`; log PostgREST code/message only.

**Contract**: `POST /api/sessions/<id>` (form body, same fields as `POST /api/sessions`) → 302.

#### 6. Stale note and edit link on the session page

**Files**: `src/pages/sessions/[id].astro`, `src/components/sessions/SuggestionPanel.tsx`

**Intent**: Add an "Edit session" link. When a stored suggestion exists and `session.updatedAt > stored.createdAt`, show "Suggested before you edited this session" with the suggestion (prop on the panel, rendered only for stored suggestions).

**Contract**: `SuggestionPanel` prop `editedAfter?: boolean`.

#### 7. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Steps: anonymous `/sessions/<id>/edit` redirects; edit page renders 200; posting a changed distance redirects to the session page and the page shows the new distance; posting a different `sessionType` redirects to the edit page with `?error=`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including form-values round-trip and change-detection cases (unchanged, each field changed, range vs single value, splits null vs empty): `npm test`
- Type check and build pass: `npm run build`
- Lint passes (ignoring CRLF noise): `npm run lint`
- Smoke passes, including the edit steps: `npm run smoke`

#### Manual Verification:

- Edit an erg and a water session on a phone: every field is prefilled correctly, the type toggle is locked, changes show on the session page and the analysis updates
- Edit a session that has a suggestion: the note "Suggested before you edited this session" appears; open the edit form and save without changes on another session with a suggestion: no note appears
- An invalid value (e.g. distance 50) returns to the edit form with the error message and the session is unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Delete session

### Overview

Inline confirmed delete, delete endpoint, notice on the list, and RLS proof for owner delete + cascade.

### Changes Required:

#### 1. Delete control

**File**: `src/components/sessions/DeleteSessionButton.tsx` (new), used in `src/pages/sessions/[id].astro`

**Intent**: "Delete session" button that reveals "Delete this session and its suggestion? Delete / Cancel"; "Delete" submits a real form POST so it works without extra fetch logic.

**Contract**: props `{ sessionId: string }`; form `POST /api/sessions/<id>/delete`.

#### 2. Delete endpoint

**File**: `src/pages/api/sessions/[id]/delete.ts` (new)

**Intent**: Signed-in only; validate the id; delete the row (RLS limits it to the owner; the suggestion goes via cascade); redirect to `/sessions?deleted=1`. A missing/foreign id also redirects to `/sessions` (no existence leak); a DB error redirects back to the session page with `?error=` and the page shows it.

**Contract**: `POST /api/sessions/<id>/delete` → 302.

#### 3. RLS check

**File**: `scripts/rls-check.mjs`

**Intent**: After the existing B-cannot-delete step, add: A updates own session (1 row); A deletes own session → 1 row, and A's suggestion for it is gone (cascade). Place it so later "unchanged on re-read" steps still hold (use a dedicated session or run at the end).

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Final steps: delete the smoke session → 302 to `/sessions?deleted=1`; its page then returns 404.

### Success Criteria:

#### Automated Verification:

- Type check and build pass: `npm run build`
- Lint passes (ignoring CRLF noise): `npm run lint`
- Unit tests pass: `npm test`
- RLS check passes, including owner update/delete and cascade: `npm run rls-check`
- Smoke passes, including the delete steps: `npm run smoke`

#### Manual Verification:

- On a phone, "Delete session" → "Cancel" keeps the session; "Delete" removes it, lands on `/sessions` with "Session deleted", and the session no longer appears in the list or as the dashboard's latest session
- Deleting a session with a suggestion: the next logged session still gets analysis and a suggestion as usual
- After merge, the deploy job succeeds and list/edit/delete work on https://rowing-coach-ai.jecruman.workers.dev

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- `toSessionFormValues` → `SessionInputSchema` round trip for erg and water sessions, with and without optional fields
- `sessionInputChanged`: unchanged input, each field changed individually, `spm` single value vs equal range, splits null vs absent, comment trimmed/empty

### Integration Tests:

- rls-check: owner update and delete, cascade removes the suggestion, other users still blocked
- smoke: list, edit (change, type-change rejection), delete

### Manual Testing Steps:

1. Log 3 sessions, open `/sessions`, check order and values
2. Edit one with a suggestion, confirm the stale note; save another unchanged, confirm no note
3. Delete one via the inline confirm, confirm notice and that it's gone everywhere

## Performance Considerations

List reads are one indexed query (`sessions_user_rowed_on_idx`) of at most 21 rows; edit/delete are single-row writes. No model calls are added — editing never triggers a new suggestion for a session that already has one.

## Migration Notes

None. No new migration; existing policies, trigger and cascade cover update and delete.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-006)
- Previous slice: `context/archive/2026-10-08-first-session-suggestion/plan.md`
- Log endpoint pattern: `src/pages/api/sessions.ts`
- Loaders: `src/lib/services/sessions/load.ts`
- Lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session list and navigation

#### Automated

- [x] 1.1 Type check and build pass: `npm run build` — 5e0fe45
- [x] 1.2 Lint passes (ignoring CRLF "Delete ␍" noise): `npm run lint` — 5e0fe45
- [x] 1.3 Unit tests pass: `npm test` — 5e0fe45
- [x] 1.4 Smoke passes against a local server, including the new list steps: `npm run smoke` — 5e0fe45

#### Manual

- [ ] 1.5 On a phone-width browser, `/sessions` lists sessions newest first with date, type, distance, time and pace, and each row opens the right session
- [ ] 1.6 With more than 20 sessions (or `pageSize` temporarily lowered), "Older" and "Newer" page correctly and the first page has no "Newer" link
- [ ] 1.7 Dashboard and session page "All sessions" links work

### Phase 2: Edit session

#### Automated

- [x] 2.1 Unit tests pass, including form-values round-trip and change-detection cases (unchanged, each field changed, range vs single value, splits null vs empty): `npm test` — 2909271
- [x] 2.2 Type check and build pass: `npm run build` — 2909271
- [x] 2.3 Lint passes (ignoring CRLF noise): `npm run lint` — 2909271
- [ ] 2.4 Smoke passes, including the edit steps: `npm run smoke`

#### Manual

- [ ] 2.5 Edit an erg and a water session on a phone: every field is prefilled correctly, the type toggle is locked, changes show on the session page and the analysis updates
- [ ] 2.6 Edit a session that has a suggestion: the note "Suggested before you edited this session" appears; open the edit form and save without changes on another session with a suggestion: no note appears
- [ ] 2.7 An invalid value (e.g. distance 50) returns to the edit form with the error message and the session is unchanged

### Phase 3: Delete session

#### Automated

- [x] 3.1 Type check and build pass: `npm run build`
- [x] 3.2 Lint passes (ignoring CRLF noise): `npm run lint`
- [x] 3.3 Unit tests pass: `npm test`
- [ ] 3.4 RLS check passes, including owner update/delete and cascade: `npm run rls-check`
- [ ] 3.5 Smoke passes, including the delete steps: `npm run smoke`

#### Manual

- [ ] 3.6 On a phone, "Delete session" → "Cancel" keeps the session; "Delete" removes it, lands on `/sessions` with "Session deleted", and the session no longer appears in the list or as the dashboard's latest session
- [ ] 3.7 Deleting a session with a suggestion: the next logged session still gets analysis and a suggestion as usual
- [ ] 3.8 After merge, the deploy job succeeds and list/edit/delete work on https://rowing-coach-ai.jecruman.workers.dev
