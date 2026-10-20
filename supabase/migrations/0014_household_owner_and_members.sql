-- 0014_household_owner_and_members.sql

alter table public.households
  add column if not exists owner_id uuid references auth.users (id);

-- Backfill: earliest member per household
update public.households h
set owner_id = m.user_id
from (
  select distinct on (household_id) household_id, user_id
  from public.household_members
  order by household_id, created_at asc, user_id asc
) m
where h.id = m.household_id
  and h.owner_id is null;

-- Orphan households without members: delete or leave nullable briefly
delete from public.households where owner_id is null;

alter table public.households
  alter column owner_id set not null;

create or replace function public.bootstrap_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.ensure_profile();

  select household_id into hid
  from public.household_members
  where user_id = auth.uid();
  if hid is not null then
    return hid;
  end if;

  insert into public.households (owner_id)
  values (auth.uid())
  returning id into hid;

  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid());

  insert into public.invites (household_id, code, expires_at)
  values (hid, encode(extensions.gen_random_bytes(16), 'hex'), now() + interval '7 days');

  return hid;
end;
$$;

create or replace function public.invite_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
  normalized text;
  target_id uuid;
  target_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  normalized := lower(btrim(p_email));
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or normalized ~ '@nido-lactancia\.local$' then
    raise exception 'invalid email';
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

  select id into target_id
  from auth.users
  where lower(email) = normalized
  limit 1;

  if target_id is not null then
    select household_id into target_household
    from public.household_members
    where user_id = target_id;

    if target_household = hid then
      return;
    end if;

    if target_household is not null then
      raise exception 'already in a household';
    end if;

    insert into public.household_members (household_id, user_id)
    values (hid, target_id);

    delete from public.email_invites
    where household_id = hid
      and email = normalized;
    return;
  end if;

  insert into public.email_invites (household_id, email, invited_by, created_at)
  values (hid, normalized, auth.uid(), now())
  on conflict (household_id, email)
  do update set invited_by = excluded.invited_by, created_at = now();
end;
$$;

create or replace function public.list_household_people()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', hm.user_id,
        'email', coalesce(p.email, ''),
        'is_owner', hm.user_id = h.owner_id,
        'is_self', hm.user_id = auth.uid()
      ) order by (hm.user_id = h.owner_id) desc, p.email asc)
      from public.household_members hm
      join public.households h on h.id = hm.household_id
      left join public.profiles p on p.id = hm.user_id
      where hm.household_id = hid
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', ei.email,
        'created_at', ei.created_at
      ) order by ei.created_at asc)
      from public.email_invites ei
      where ei.household_id = hid
    ), '[]'::jsonb)
  ) into result
  from public.households
  where id = hid;

  return result;
end;
$$;

create or replace function public.remove_household_member(p_user_id uuid)
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
    raise exception 'cannot remove self';
  end if;

  if p_user_id = owner then
    raise exception 'cannot remove owner';
  end if;

  delete from public.household_members
  where household_id = hid
    and user_id = p_user_id;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

create or replace function public.cancel_email_invite(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  normalized := lower(btrim(p_email));

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

  delete from public.email_invites
  where household_id = hid
    and email = normalized;

  if not found then
    raise exception 'invite not found';
  end if;
end;
$$;

create or replace function public.leave_household()
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

  if owner = auth.uid() then
    raise exception 'owner cannot leave';
  end if;

  delete from public.household_members
  where household_id = hid
    and user_id = auth.uid();
end;
$$;

revoke all on function public.list_household_people() from public, anon, authenticated;
revoke all on function public.remove_household_member(uuid) from public, anon, authenticated;
revoke all on function public.cancel_email_invite(text) from public, anon, authenticated;
revoke all on function public.leave_household() from public, anon, authenticated;

grant execute on function public.list_household_people() to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
grant execute on function public.cancel_email_invite(text) to authenticated;
grant execute on function public.leave_household() to authenticated;
