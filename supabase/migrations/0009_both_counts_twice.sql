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
  feed_day_count bigint;
  minutes_per_feed float8;
  pee_count bigint;
  poop_count bigint;
  both_count bigint;
  pee_day_count bigint;
  poop_day_count bigint;
  both_day_count bigint;
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

  select count(*), count(distinct (started_at at time zone p_tz)::date)
  into feed_count, feed_day_count
  from public.feeds
  where baby_id = p_baby_id
    and (started_at at time zone p_tz)::date between p_from and p_to;

  select avg(greatest(0, extract(epoch from (ended_at - started_at)) * 1000.0 - paused_ms) / 60000.0)
  into minutes_per_feed
  from public.feeds
  where baby_id = p_baby_id
    and ended_at is not null
    and (started_at at time zone p_tz)::date between p_from and p_to;

  select
    count(*) filter (where kind in ('pee', 'both')),
    count(*) filter (where kind in ('poop', 'both')),
    count(*) filter (where kind = 'both'),
    count(distinct (occurred_at at time zone p_tz)::date) filter (where kind in ('pee', 'both')),
    count(distinct (occurred_at at time zone p_tz)::date) filter (where kind in ('poop', 'both')),
    count(distinct (occurred_at at time zone p_tz)::date) filter (where kind = 'both')
  into pee_count, poop_count, both_count, pee_day_count, poop_day_count, both_day_count
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
    'feeds_per_day', case when feed_day_count = 0 then null else feed_count::float8 / feed_day_count end,
    'minutes_per_feed', minutes_per_feed,
    'pee_per_day', case when pee_day_count = 0 then null else pee_count::float8 / pee_day_count end,
    'poop_per_day', case when poop_day_count = 0 then null else poop_count::float8 / poop_day_count end,
    'both_diapers_per_day', case when both_day_count = 0 then null else both_count::float8 / both_day_count end,
    'mean_gap_minutes', mean_gap
  );
end;
$$;
