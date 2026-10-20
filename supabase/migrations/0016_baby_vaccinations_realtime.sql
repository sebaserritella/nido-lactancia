-- 0016_baby_vaccinations_realtime.sql

alter table public.baby_vaccinations replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.baby_vaccinations;
  end if;
end $$;
