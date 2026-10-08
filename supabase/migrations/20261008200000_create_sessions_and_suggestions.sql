-- Logged rowing sessions and one stored coach suggestion per session.
-- Constraints encode the product rules so bad data cannot be stored even if app validation is bypassed.
-- RLS: each signed-in user can only read and write their own rows; anon gets no access.
-- Reuses public.set_updated_at() from 20261008151626_create_profiles_and_goals.sql.

-- sessions ------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_type text not null check (session_type in ('erg', 'water')),
  rowed_on date not null default current_date,
  distance_m int not null check (distance_m between 100 and 100000),
  duration_s numeric(7, 1) not null check (duration_s > 0 and duration_s <= 36000),
  -- Per-500 m split times. cardinality (not array_length) so an empty array fails the check;
  -- array_position(..., null) rejects null elements, which `0 < all (...)` would let through.
  splits_s numeric(6, 1)[] check (
    splits_s is null
    or (
      cardinality(splits_s) between 1 and 200
      and array_position(splits_s, null) is null
      and 0 < all (splits_s)
    )
  ),
  spm_min smallint check (spm_min between 10 and 60),
  spm_max smallint check (spm_max between 10 and 60),
  dps_min numeric(4, 1) check (dps_min between 3 and 20),
  dps_max numeric(4, 1) check (dps_max between 3 and 20),
  watts smallint check (watts between 1 and 2000),
  boat text check (boat in ('1x', '2x', '2-', '4x', '4-', '8+')),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ranges are stored as both ends or neither; a single value is stored as min = max.
  constraint sessions_spm_range check ((spm_min is null) = (spm_max is null) and spm_min <= spm_max),
  constraint sessions_dps_range check ((dps_min is null) = (dps_max is null) and dps_min <= dps_max),
  -- Type-specific fields: DPS and boat are water only, watts is erg only.
  constraint sessions_water_only check (session_type = 'water' or (dps_min is null and boat is null)),
  constraint sessions_erg_only check (session_type = 'erg' or watts is null)
);

-- "Latest" order used by every history read: rowed_on desc, then created_at desc.
create index sessions_user_rowed_on_idx on public.sessions (user_id, rowed_on desc, created_at desc);

alter table public.sessions enable row level security;

create policy "sessions_select_own" on public.sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sessions_insert_own" on public.sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "sessions_update_own" on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "sessions_delete_own" on public.sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- coach_suggestions ---------------------------------------------------------

create table public.coach_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- One stored suggestion per session; it goes away with its session.
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  suggestion jsonb not null,
  is_default boolean not null default false,
  -- Only model failures are stored as defaults ("not allowed" / "not configured" defaults are never stored).
  default_reason text check (default_reason in ('model_failed')),
  attempts smallint not null check (attempts between 1 and 2),
  model text not null,
  created_at timestamptz not null default now(),
  constraint coach_suggestions_default_reason check (is_default = (default_reason is not null))
);

alter table public.coach_suggestions enable row level security;

create policy "coach_suggestions_select_own" on public.coach_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The referenced session must belong to the caller too. The column is qualified with the table name
-- so it cannot be shadowed by a sessions column inside the subquery.
create policy "coach_suggestions_insert_own" on public.coach_suggestions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.sessions s
      where s.id = coach_suggestions.session_id
        and s.user_id = (select auth.uid())
    )
  );

-- No update policy: a stored suggestion is immutable.

create policy "coach_suggestions_delete_own" on public.coach_suggestions
  for delete to authenticated
  using (user_id = (select auth.uid()));
