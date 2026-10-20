-- 0018_pediatric_visits.sql

create table public.pediatric_visits (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  visited_on date not null,
  reason text not null,
  notes text,
  grams integer,
  length_mm integer,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint pediatric_visits_grams_check
    check (grams is null or (grams > 0 and grams < 30000)),
  constraint pediatric_visits_length_mm_check
    check (length_mm is null or (length_mm >= 200 and length_mm <= 1200)),
  constraint pediatric_visits_measure_ok
    check (
      (grams is null and length_mm is null)
      or (grams is not null or length_mm is not null)
    ),
  constraint pediatric_visits_visited_on_not_future
    check (visited_on <= (timezone('utc', now()))::date)
);

create index pediatric_visits_baby_id on public.pediatric_visits (baby_id);

alter table public.pediatric_visits enable row level security;

create policy pediatric_visits_select on public.pediatric_visits
  for select to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

create policy pediatric_visits_insert on public.pediatric_visits
  for insert to authenticated
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

create policy pediatric_visits_update on public.pediatric_visits
  for update to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

create policy pediatric_visits_delete on public.pediatric_visits
  for delete to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

grant select, insert, update, delete on public.pediatric_visits to authenticated;
