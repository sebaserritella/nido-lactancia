-- 0019_transfer_household_ownership.sql

create or replace function public.transfer_household_ownership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select hm.household_id, h.owner_id into hid, owner
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  if owner is distinct from auth.uid() then
    raise exception 'not household owner';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot transfer to self';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = hid and user_id = p_user_id
  ) then
    raise exception 'member not found';
  end if;

  update public.households
  set owner_id = p_user_id
  where id = hid;
end;
$$;

revoke all on function public.transfer_household_ownership(uuid) from public, anon, authenticated;
grant execute on function public.transfer_household_ownership(uuid) to authenticated;
