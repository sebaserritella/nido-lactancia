-- 0022_vaccine_custom_names.sql

alter table public.baby_vaccinations
  alter column catalog_id drop not null;

alter table public.baby_vaccinations
  add column if not exists display_name text,
  add column if not exists custom_name text;

alter table public.baby_vaccinations
  drop constraint if exists baby_vaccinations_baby_id_catalog_id_key;

drop index if exists baby_vaccinations_baby_id_catalog_id_key;

create unique index if not exists baby_vaccinations_baby_id_catalog_id_uidx
  on public.baby_vaccinations (baby_id, catalog_id)
  where catalog_id is not null;

alter table public.baby_vaccinations
  drop constraint if exists baby_vaccinations_catalog_xor_custom;

alter table public.baby_vaccinations
  add constraint baby_vaccinations_catalog_xor_custom
  check (
    (
      catalog_id is not null
      and custom_name is null
    )
    or (
      catalog_id is null
      and display_name is null
      and custom_name is not null
      and length(trim(custom_name)) > 0
    )
  );
