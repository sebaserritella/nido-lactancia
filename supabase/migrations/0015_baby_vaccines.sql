-- 0015_baby_vaccines.sql

create table public.vaccine_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  life_stage text not null
    check (life_stage in (
      'pregnancy', 'newborn', 'up_to_1y', 'up_to_2y',
      'age_5', 'age_11', 'age_15_64', 'age_65_plus'
    )),
  due_label text not null,
  sort_order int not null,
  active boolean not null default true
);

create table public.baby_vaccinations (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  catalog_id uuid not null references public.vaccine_catalog (id) on delete restrict,
  status text not null check (status in ('pending', 'done')),
  given_on date,
  lot_number text,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (baby_id, catalog_id),
  constraint baby_vaccinations_given_on_not_future
    check (given_on is null or given_on <= (timezone('utc', now()))::date)
);

create index baby_vaccinations_baby_id on public.baby_vaccinations (baby_id);

alter table public.vaccine_catalog enable row level security;
alter table public.baby_vaccinations enable row level security;

-- Catalogue readable by any authenticated user
create policy vaccine_catalog_select on public.vaccine_catalog
  for select to authenticated using (true);

-- Baby vaccinations: household of baby
create policy baby_vaccinations_select on public.baby_vaccinations
  for select to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

create policy baby_vaccinations_insert on public.baby_vaccinations
  for insert to authenticated
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

create policy baby_vaccinations_update on public.baby_vaccinations
  for update to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

create policy baby_vaccinations_delete on public.baby_vaccinations
  for delete to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

grant select on public.vaccine_catalog to authenticated;
grant select, insert, update, delete on public.baby_vaccinations to authenticated;

-- Seed: Calendario Nacional (infant stages). Codes are stable.
insert into public.vaccine_catalog (code, name, life_stage, due_label, sort_order) values
  ('hepb_birth', 'Hepatitis B', 'newborn', 'Al nacer', 10),
  ('bcg_birth', 'BCG', 'newborn', 'Al nacer', 20),
  ('pneumo_2m', 'Neumococo', 'up_to_1y', '2 meses', 110),
  ('polio_2m', 'Polio', 'up_to_1y', '2 meses', 120),
  ('quintuple_2m', 'Quíntuple', 'up_to_1y', '2 meses', 130),
  ('rota_2m', 'Rotavirus', 'up_to_1y', '2 meses', 140),
  ('meningo_3m', 'Meningococo', 'up_to_1y', '3 meses', 150),
  ('pneumo_4m', 'Neumococo', 'up_to_1y', '4 meses', 160),
  ('polio_4m', 'Polio', 'up_to_1y', '4 meses', 170),
  ('quintuple_4m', 'Quíntuple', 'up_to_1y', '4 meses', 180),
  ('rota_4m', 'Rotavirus', 'up_to_1y', '4 meses', 190),
  ('meningo_5m', 'Meningococo', 'up_to_1y', '5 meses', 200),
  ('polio_6m', 'Polio', 'up_to_1y', '6 meses', 210),
  ('quintuple_6m', 'Quíntuple', 'up_to_1y', '6 meses', 220),
  ('flu_6_24_1', 'Antigripal', 'up_to_1y', '6 a 24 meses · 1ª', 230),
  ('flu_6_24_2', 'Antigripal', 'up_to_1y', '6 a 24 meses · 2ª', 240),
  ('pneumo_12m', 'Neumococo', 'up_to_1y', '12 meses', 250),
  ('hepa_12m', 'Hepatitis A', 'up_to_1y', '12 meses', 260),
  ('mmr_12m', 'Triple viral', 'up_to_1y', '12 meses', 270),
  ('meningo_15m', 'Meningococo', 'up_to_2y', '15 meses', 310),
  ('varicella_15m', 'Varicela', 'up_to_2y', '15 meses', 320),
  ('quintuple_15_18m', 'Quíntuple', 'up_to_2y', '15 a 18 meses', 330),
  ('mmr_5y', 'Triple viral', 'age_5', '5 años', 410),
  ('polio_5y', 'Polio', 'age_5', '5 años', 420),
  ('triple_bac_5y', 'Triple bacteriana', 'age_5', '5 años', 430);
