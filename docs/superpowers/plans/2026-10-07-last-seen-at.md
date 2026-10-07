# last_seen_at Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each user's last app use on `profiles.last_seen_at` via RPC for admin SQL queries.

**Architecture:** Migration adds nullable `last_seen_at` and security-definer `touch_last_seen()`. The signed-in client calls the RPC with a 10-minute localStorage throttle. No UI; no general profiles UPDATE policy.

**Tech Stack:** Supabase SQL migrations, React `App.tsx`, localClient mock, Vitest.

## Global Constraints

- Admin-only visibility (SQL); no in-app UI.
- Failures of `touch_last_seen` must not block the tracker.
- Do not add a general `UPDATE` RLS policy on `profiles`.
- Apply migration on live Supabase before/with deploy; `check:live-schema` only cares about selected columns (app must not select `last_seen_at`).

## File map

- Create: `supabase/migrations/0012_last_seen_at.sql`
- Create: `src/lib/lastSeen.ts` — throttle + touch helper
- Create: `src/lib/lastSeen.test.ts`
- Modify: `src/lib/localClient.ts` — handle `touch_last_seen` RPC
- Modify: `src/App.tsx` — call touch when session is active
- Modify: `src/lib/localClient.test.ts` — cover RPC success when signed in

---

### Task 1: Migration + local RPC + throttle helper

**Files:**
- Create: `supabase/migrations/0012_last_seen_at.sql`
- Create: `src/lib/lastSeen.ts`
- Create: `src/lib/lastSeen.test.ts`
- Modify: `src/lib/localClient.ts` (rpc switch)
- Test: `src/lib/lastSeen.test.ts`, `src/lib/localClient.test.ts`

**Interfaces:**
- Produces: `shouldTouchLastSeen(storage, userId, nowMs, throttleMs?): boolean`
- Produces: `markLastSeenTouched(storage, userId, nowMs): void`
- Produces: `touchLastSeenIfDue(client, storage, userId): Promise<void>` (calls rpc, ignores errors, marks only on success)
- Produces: SQL `public.touch_last_seen()` returns void

- [ ] **Step 1: Write failing tests for throttle + local RPC**

```ts
// lastSeen.test.ts — shouldTouch false within 10 min after mark; true when never marked or after throttle
// localClient.test.ts — signed-in rpc("touch_last_seen") returns { error: null }
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/lastSeen.test.ts src/lib/localClient.test.ts`

- [ ] **Step 3: Add migration**

```sql
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

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

- [ ] **Step 4: Implement `lastSeen.ts` and localClient branch**

Throttle key: `nido:last-seen:<userId>`, interval `10 * 60 * 1000`.

Local client: `if (name === "touch_last_seen") return { data: null, error: null };`

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit** (only if user asked)

---

### Task 2: Wire App + apply live migration

**Files:**
- Modify: `src/App.tsx` — in the session effect, fire-and-forget `touchLastSeenIfDue`
- Apply: live Supabase SQL from `0012_last_seen_at.sql`
- Verify: RPC callable / column exists (REST or SQL)

- [ ] **Step 1: Call touch from App when `client` + `session` exist**

```ts
void touchLastSeenIfDue(client, localStorage, userId);
```

Place near the start of the household bootstrap effect (do not await in a way that blocks household).

- [ ] **Step 2: Run `npm test` and `npm run build`**

- [ ] **Step 3: Apply migration on live project; confirm column/RPC**

- [ ] **Step 4: Commit** (only if user asked)
