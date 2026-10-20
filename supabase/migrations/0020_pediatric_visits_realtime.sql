-- 0020_pediatric_visits_realtime.sql

alter table public.pediatric_visits replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pediatric_visits;
  end if;
end $$;
