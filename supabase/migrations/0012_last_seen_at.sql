alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.touch_last_seen() to authenticated;
