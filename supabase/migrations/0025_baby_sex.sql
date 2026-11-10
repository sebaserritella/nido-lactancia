-- 0025_baby_sex.sql
-- Sex for the WHO growth percentiles. Optional.

alter table public.babies
  add column if not exists sex text;

alter table public.babies
  drop constraint if exists babies_sex_check;

alter table public.babies
  add constraint babies_sex_check check (sex is null or sex in ('female', 'male'));
