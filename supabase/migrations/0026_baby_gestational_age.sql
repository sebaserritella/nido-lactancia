-- 0026_baby_gestational_age.sql
-- Gestational age at birth in days (37+1 = 260). Below 37+0 the app compares growth by corrected age. Optional.

alter table public.babies
  add column if not exists gestational_days smallint;

alter table public.babies
  drop constraint if exists babies_gestational_days_check;

alter table public.babies
  add constraint babies_gestational_days_check
  check (gestational_days is null or gestational_days between 154 and 314);
