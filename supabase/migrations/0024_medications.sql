-- 0024_medications.sql
-- Medicines and supplements a baby takes (e.g. vitamina D), and each dose given.

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  name text not null,
  dose text,
  times_per_day smallint not null default 1,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint medications_name_check check (length(trim(name)) > 0),
  constraint medications_times_per_day_check check (times_per_day between 1 and 12)
);

create index medications_baby_id on public.medications (baby_id);

create table public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  given_at timestamptz not null default now(),
  given_by uuid not null references auth.users (id)
);

create index medication_doses_baby_given on public.medication_doses (baby_id, given_at);

alter table public.medications enable row level security;
alter table public.medication_doses enable row level security;

create policy medications_select on public.medications
  for select to authenticated
  using (exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id)));

create policy medications_insert on public.medications
  for insert to authenticated
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id))
  );

create policy medications_update on public.medications
  for update to authenticated
  using (exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id)))
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id))
  );

create policy medications_delete on public.medications
  for delete to authenticated
  using (exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id)));

create policy medication_doses_select on public.medication_doses
  for select to authenticated
  using (exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id)));

create policy medication_doses_insert on public.medication_doses
  for insert to authenticated
  with check (
    given_by = auth.uid()
    and exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id))
    and exists (select 1 from public.medications m where m.id = medication_id and m.baby_id = medication_doses.baby_id)
  );

create policy medication_doses_delete on public.medication_doses
  for delete to authenticated
  using (exists (select 1 from public.babies b where b.id = baby_id and public.is_household_member(b.household_id)));

grant select, insert, update, delete on public.medications to authenticated;
grant select, insert, delete on public.medication_doses to authenticated;

alter table public.medications replica identity full;
alter table public.medication_doses replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.medications;
    alter publication supabase_realtime add table public.medication_doses;
  end if;
end $$;
