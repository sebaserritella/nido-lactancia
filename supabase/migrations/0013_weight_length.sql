alter table public.weights
  alter column grams drop not null;

alter table public.weights
  drop constraint if exists weights_grams_check;

alter table public.weights
  add column if not exists length_mm integer;

alter table public.weights
  add constraint weights_grams_check
  check (grams is null or (grams > 0 and grams < 30000));

alter table public.weights
  add constraint weights_length_mm_check
  check (length_mm is null or (length_mm >= 200 and length_mm <= 1200));

alter table public.weights
  add constraint weights_measure_present
  check (grams is not null or length_mm is not null);
