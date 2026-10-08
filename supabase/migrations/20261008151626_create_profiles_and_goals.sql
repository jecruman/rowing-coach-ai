-- First per-user tables: rower profile (one row per user) and goals (one per user and session type).
-- Constraints encode the product rules so bad data cannot be stored even if app validation is bypassed.
-- RLS: each signed-in user can only read and write their own rows; anon gets no access.

-- Shared trigger function: keeps updated_at current on every update. Reused by all later tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Upper bound is a fixed sanity limit: a CHECK must be immutable, so "not in the future"
  -- is enforced by app validation instead.
  birth_year int check (birth_year between 1900 and 2100),
  weight_kg numeric(5, 1) check (weight_kg between 30 and 200),
  boat text check (boat in ('1x', '2x', '2-', '4x', '4-', '8+')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- goals ---------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_type text not null check (session_type in ('erg', 'water')),
  distance_m int not null check (distance_m between 100 and 100000),
  target_seconds numeric(7, 1) not null check (target_seconds > 0),
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- At most one goal per session type per user.
  unique (user_id, session_type)
);

alter table public.goals enable row level security;

create policy "goals_select_own" on public.goals
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "goals_insert_own" on public.goals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "goals_update_own" on public.goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "goals_delete_own" on public.goals
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();
