alter table public.babies
  add column born_on date;

create table public.weights (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  baby_id uuid not null references public.babies (id) on delete cascade,
  weighed_on date not null,
  grams integer not null check (grams > 0 and grams < 30000),
  created_at timestamptz not null default now(),
  unique (baby_id, weighed_on)
);

alter table public.weights enable row level security;

create policy weights_select on public.weights
  for select using (public.is_household_member(household_id));

create policy weights_insert on public.weights
  for insert with check (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.babies
      where babies.id = baby_id
        and babies.household_id = weights.household_id
    )
  );

create policy weights_update on public.weights
  for update
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.babies
      where babies.id = baby_id
        and babies.household_id = weights.household_id
    )
  );

create policy weights_delete on public.weights
  for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.weights to authenticated;

alter table public.weights replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.weights;
  end if;
end $$;
