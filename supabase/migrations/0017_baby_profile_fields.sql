-- 0017_baby_profile_fields.sql

alter table public.babies
  add column if not exists pediatrician_name text,
  add column if not exists pediatrician_phone text,
  add column if not exists blood_type text,
  add column if not exists allergies text,
  add column if not exists health_insurance text;
