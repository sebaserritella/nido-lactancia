create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.babies enable row level security;
alter table public.feeds enable row level security;
alter table public.diapers enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy households_select on public.households
  for select using (public.is_household_member(id));

create policy members_select on public.household_members
  for select using (public.is_household_member(household_id));

create policy invites_select on public.invites
  for select using (public.is_household_member(household_id));

create policy babies_select on public.babies
  for select using (public.is_household_member(household_id));

create policy babies_insert on public.babies
  for insert with check (public.is_household_member(household_id));

create policy babies_update on public.babies
  for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy babies_delete on public.babies
  for delete using (public.is_household_member(household_id));

create policy feeds_select on public.feeds
  for select using (public.is_household_member(household_id));

create policy feeds_insert on public.feeds
  for insert with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.babies
      where babies.id = baby_id
        and babies.household_id = feeds.household_id
    )
  );

create policy feeds_update on public.feeds
  for update
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.babies
      where babies.id = baby_id
        and babies.household_id = feeds.household_id
    )
  );

create policy feeds_delete on public.feeds
  for delete using (public.is_household_member(household_id));

create policy diapers_select on public.diapers
  for select using (public.is_household_member(household_id));

create policy diapers_insert on public.diapers
  for insert with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.babies
      where babies.id = baby_id
        and babies.household_id = diapers.household_id
    )
  );

create policy diapers_update on public.diapers
  for update
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.babies
      where babies.id = baby_id
        and babies.household_id = diapers.household_id
    )
  );

create policy diapers_delete on public.diapers
  for delete using (public.is_household_member(household_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select on public.invites to authenticated;
grant select, insert, update, delete on public.babies to authenticated;
grant select, insert, update, delete on public.feeds to authenticated;
grant select, insert, update, delete on public.diapers to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feeds;
    alter publication supabase_realtime add table public.diapers;
    alter publication supabase_realtime add table public.babies;
  end if;
end $$;
