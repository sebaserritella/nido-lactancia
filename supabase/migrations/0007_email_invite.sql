create table public.email_invites (
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (household_id, email),
  constraint email_invites_email_format check (
    email = lower(email)
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and email !~ '@nido-lactancia\.local$'
  )
);

create index email_invites_email_created_at
  on public.email_invites (email, created_at desc);

alter table public.email_invites enable row level security;

create policy email_invites_select on public.email_invites
  for select using (public.is_household_member(household_id));

grant select on public.email_invites to authenticated;

create or replace function public.invite_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
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

  select household_id into hid
  from public.household_members
  where user_id = auth.uid();
  if hid is null then
    raise exception 'not in a household';
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

create or replace function public.accept_email_invite()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  hid uuid;
  invite_household uuid;
  invite_email text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = uid;
  if hid is not null then
    return hid;
  end if;

  select lower(email) into user_email
  from auth.users
  where id = uid;

  if user_email is null then
    return null;
  end if;

  select household_id, email
  into invite_household, invite_email
  from public.email_invites
  where email = user_email
  order by created_at desc
  limit 1;

  if invite_household is null then
    return null;
  end if;

  insert into public.household_members (household_id, user_id)
  values (invite_household, uid);

  delete from public.email_invites
  where household_id = invite_household
    and email = invite_email;

  return invite_household;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_household uuid;
  invite_email text;
begin
  insert into public.profiles (id, email)
  values (new.id, lower(new.email))
  on conflict (id) do nothing;

  if exists (select 1 from public.household_members where user_id = new.id) then
    return new;
  end if;

  select household_id, email
  into invite_household, invite_email
  from public.email_invites
  where email = lower(new.email)
  order by created_at desc
  limit 1;

  if invite_household is null then
    return new;
  end if;

  insert into public.household_members (household_id, user_id)
  values (invite_household, new.id);

  delete from public.email_invites
  where household_id = invite_household
    and email = invite_email;

  return new;
end;
$$;

revoke all on function public.invite_by_email(text) from public, anon, authenticated;
revoke all on function public.accept_email_invite() from public, anon, authenticated;
grant execute on function public.invite_by_email(text) to authenticated;
grant execute on function public.accept_email_invite() to authenticated;
