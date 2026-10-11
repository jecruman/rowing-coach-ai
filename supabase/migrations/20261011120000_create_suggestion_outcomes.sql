-- The rower's done/skipped mark for a stored coach suggestion, entered while logging the next session.
-- One final mark per suggestion: insert-only (no update or delete policy), like coach_suggestions.
-- "done" means the logged session is the suggested one; "skipped" means it was not done.
-- RLS: each signed-in user can only read and insert their own rows; anon gets no access.

create table public.suggestion_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The suggestion being marked; the mark goes away with it (and so with its session).
  suggestion_id uuid not null unique references public.coach_suggestions (id) on delete cascade,
  -- The session logged together with the mark; one mark per logged session.
  logged_session_id uuid not null unique references public.sessions (id) on delete cascade,
  outcome text not null check (outcome in ('done', 'skipped')),
  created_at timestamptz not null default now()
);

alter table public.suggestion_outcomes enable row level security;

create policy "suggestion_outcomes_select_own" on public.suggestion_outcomes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Both referenced rows must belong to the caller too. Columns are qualified with the table name
-- so they cannot be shadowed by columns of the same name inside the subqueries.
create policy "suggestion_outcomes_insert_own" on public.suggestion_outcomes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.coach_suggestions c
      where c.id = suggestion_outcomes.suggestion_id
        and c.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.sessions s
      where s.id = suggestion_outcomes.logged_session_id
        and s.user_id = (select auth.uid())
    )
  );

-- No update or delete policy: a mark is final once set.
