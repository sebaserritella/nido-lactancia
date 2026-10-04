do $$
declare
  constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'username'
  ) then
    for constraint_name in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'profiles'
        and con.contype = 'c'
    loop
      execute format('alter table public.profiles drop constraint %I', constraint_name);
    end loop;
    alter table public.profiles rename column username to email;
  end if;
end $$;

delete from public.profiles
where email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

alter table public.profiles drop constraint if exists profiles_email_format;
alter table public.profiles
  add constraint profiles_email_format
  check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  select users.id, lower(users.email)
  from auth.users
  where users.id = auth.uid()
  on conflict (id) do nothing;
end;
$$;
