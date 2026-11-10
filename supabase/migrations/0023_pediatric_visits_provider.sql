-- 0023_pediatric_visits_provider.sql
-- Where the control was done or who did it (e.g. "Otorrino · Hospital X"). Optional.

alter table public.pediatric_visits
  add column if not exists provider text;
