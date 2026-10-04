create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  select users.id, lower(users.email)
  from auth.users
  where users.id = auth.uid()
  on conflict (id) do nothing;
end;
$$;

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

  insert into public.households default values returning id into hid;
  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid());
  insert into public.invites (household_id, code, expires_at)
  values (hid, encode(extensions.gen_random_bytes(16), 'hex'), now() + interval '7 days');
  return hid;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.ensure_profile();

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'already in a household';
  end if;

  select id, household_id into invite_id, hid
  from public.invites
  where code = btrim(p_code)
    and redeemed_at is null
    and expires_at > now()
  for update;

  if invite_id is null then
    raise exception 'invalid invite';
  end if;

  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid());

  update public.invites
  set redeemed_by = auth.uid(), redeemed_at = now()
  where id = invite_id;

  return hid;
end;
$$;

create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  new_code text;
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

  new_code := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.invites (household_id, code, expires_at)
  values (hid, new_code, now() + interval '7 days');
  return new_code;
end;
$$;

create or replace function public.range_stats_for_household(
  p_household_id uuid,
  p_baby_id uuid,
  p_from date,
  p_to date,
  p_tz text
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  day_count integer;
  feed_count bigint;
  minutes_per_feed float8;
  pee_count bigint;
  poop_count bigint;
  both_count bigint;
  mean_gap float8;
begin
  if p_to < p_from then
    raise exception 'invalid range';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'invalid timezone';
  end if;
  if not exists (
    select 1 from public.babies
    where id = p_baby_id and household_id = p_household_id
  ) then
    raise exception 'not allowed';
  end if;

  day_count := (p_to - p_from) + 1;

  select count(*) into feed_count
  from public.feeds
  where baby_id = p_baby_id
    and (started_at at time zone p_tz)::date between p_from and p_to;

  select avg(extract(epoch from (ended_at - started_at)) / 60.0) into minutes_per_feed
  from public.feeds
  where baby_id = p_baby_id
    and ended_at is not null
    and (started_at at time zone p_tz)::date between p_from and p_to;

  select
    count(*) filter (where kind = 'pee'),
    count(*) filter (where kind = 'poop'),
    count(*) filter (where kind = 'both')
  into pee_count, poop_count, both_count
  from public.diapers
  where baby_id = p_baby_id
    and (occurred_at at time zone p_tz)::date between p_from and p_to;

  select avg(extract(epoch from (started_at - prev_started)) / 60.0) into mean_gap
  from (
    select
      started_at,
      lag(started_at) over (order by started_at) as prev_started
    from public.feeds
    where baby_id = p_baby_id
      and (started_at at time zone p_tz)::date between p_from and p_to
  ) gaps
  where prev_started is not null;

  return jsonb_build_object(
    'day_count', day_count,
    'feed_count', feed_count,
    'feeds_per_day', feed_count::float8 / day_count,
    'minutes_per_feed', minutes_per_feed,
    'pee_per_day', pee_count::float8 / day_count,
    'poop_per_day', poop_count::float8 / day_count,
    'both_diapers_per_day', both_count::float8 / day_count,
    'mean_gap_minutes', mean_gap
  );
end;
$$;

create or replace function public.range_stats(
  p_baby_id uuid,
  p_from date,
  p_to date,
  p_tz text
)
returns jsonb
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

  select household_id into hid from public.babies where id = p_baby_id;
  if hid is null or not public.is_household_member(hid) then
    raise exception 'not allowed';
  end if;

  return public.range_stats_for_household(hid, p_baby_id, p_from, p_to, p_tz);
end;
$$;

revoke all on function public.ensure_profile() from public;
revoke all on function public.bootstrap_household() from public;
revoke all on function public.join_household(text) from public;
revoke all on function public.create_invite() from public;
revoke all on function public.range_stats(uuid, date, date, text) from public;
revoke all on function public.range_stats_for_household(uuid, uuid, date, date, text) from public;
revoke all on function public.is_household_member(uuid) from public;

grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.bootstrap_household() to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.range_stats(uuid, date, date, text) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
