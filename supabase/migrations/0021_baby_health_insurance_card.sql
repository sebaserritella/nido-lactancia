-- 0021_baby_health_insurance_card.sql

alter table public.babies
  add column if not exists health_insurance_card text;
