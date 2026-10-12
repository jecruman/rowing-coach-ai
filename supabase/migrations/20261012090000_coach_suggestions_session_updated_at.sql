-- Which version of the session a stored suggestion was built from.
-- The suggestion endpoint reads the session, waits up to ~90 s for the model, then stores the suggestion, so
-- `created_at` can be later than an edit made during the wait. Comparing the session's `updated_at` with this
-- column (falling back to `created_at` for older rows, where it is null) marks such a suggestion as made before
-- the edit. Suggestions stay immutable: no update policy, set once on insert.
alter table public.coach_suggestions
  add column session_updated_at timestamptz;
