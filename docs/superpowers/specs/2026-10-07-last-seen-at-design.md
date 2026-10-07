# last_seen_at — design

## Goal

Record when each authenticated user last used the app, queryable in Supabase/SQL for admin. No in-app UI.

## Non-goals

- Showing last seen in the product UI
- Precise second-by-second presence / analytics dashboards
- Updating on every navigation or keystroke

## Data

Add nullable column on `public.profiles`:

```sql
alter table public.profiles
  add column if not exists last_seen_at timestamptz;
```

Existing rows stay `null` until the user opens the app after deploy. Admin query example:

```sql
select email, last_seen_at, created_at
from public.profiles
order by last_seen_at desc nulls last;
```

## Write path

Do **not** add a general `UPDATE` RLS policy on `profiles` (clients must not set arbitrary profile fields).

Add a security-definer RPC:

```sql
create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.touch_last_seen() to authenticated;
```

The RPC only updates the caller's row and only sets `now()`.

## Client

When the app has an authenticated session (same place session/household bootstrap runs), call `touch_last_seen()` once per session open, throttled to at most once every **10 minutes** via `localStorage` (key scoped by user id). Failures are ignored (must not block the tracker).

Local/demo client: implement `touch_last_seen` as a no-op success (or in-memory stamp) so tests do not depend on live Supabase.

No `select` of `last_seen_at` in the app — live-schema check stays unaffected unless something starts selecting it.

## Deploy

Ship migration `0012_last_seen_at.sql` (or next free number). Apply on the live Nido lactancia Supabase project before/with the Pages deploy that includes the client call. Confirm RPC exists; column need not be selected by the client.

## Testing

- Unit: local client accepts `rpc("touch_last_seen")` without error when signed in.
- Optional: migration/SQL smoke if the repo already runs RPC SQL tests the same way as other RPCs.

## Out of scope

- Admin dashboard UI
- Household members viewing each other's `last_seen_at` (RLS remains select-own on `profiles`; admin uses service role / SQL editor)
