# Family members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Household owner can list/invite/remove members and cancel pending invites; members can see the list and leave; shell moves Familia to the header and Bebés edit into a new Ficha tab.

**Architecture:** Persist `households.owner_id`, expose membership via security-definer RPCs (emails without opening `profiles` RLS), tighten `invite_by_email` to owner-only, mirror behavior in `localClient`, and restructure `TrackerScreen` IA (header Familia panel + Ficha tab without vaccines yet).

**Tech Stack:** Supabase SQL migrations, TypeScript/React, Vitest, existing `messageForError` / i18n `es.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-family-members-and-baby-vaccines-design.md` (family + placement sections only).
- Owner cannot leave in v1; members cannot invite/remove/cancel.
- Do not open `profiles` SELECT to co-members; emails only via `list_household_people`.
- Vaccines / catalogue are **out of scope** for this plan (see sibling plan).
- Apply live migration before deploy; `npm run check:live-schema` must pass.
- UI copy in Spanish via `es.ts`; code identifiers in English.

## File map

- Create: `supabase/migrations/0014_household_owner_and_members.sql`
- Create: `src/screens/FamilyPanel.tsx`
- Create: `src/screens/FichaPanel.tsx`
- Modify: `supabase/migrations/0003_rpc.sql` patterns only via new migration (do not edit old files)
- Modify: `src/lib/localClient.ts`, `src/lib/localClient.test.ts`
- Modify: `src/lib/errors.ts`, `src/i18n/es.ts`
- Modify: `src/lib/resume.ts` (tab `"ficha"`)
- Modify: `src/screens/TrackerScreen.tsx`, `src/App.tsx`
- Modify: `src/styles.css` (only if panel needs existing shell patterns)

**Depends on later plan:** `docs/superpowers/plans/2026-10-20-baby-vaccines.md` adds vaccines inside `FichaPanel`.

---

### Task 1: Migration — owner_id + membership RPCs

**Files:**
- Create: `supabase/migrations/0014_household_owner_and_members.sql`

**Interfaces:**
- Produces: column `households.owner_id uuid not null references auth.users (id)`
- Produces RPCs (all `security definer`, `search_path = public`, grant execute to `authenticated`):
  - `list_household_people()` → `jsonb` `{ members: [{ user_id, email, is_owner, is_self }], pending: [{ email, created_at }] }`
  - `remove_household_member(p_user_id uuid)` → `void`
  - `cancel_email_invite(p_email text)` → `void`
  - `leave_household()` → `void`
- Produces: `invite_by_email` and `bootstrap_household` updated in this migration

- [ ] **Step 1: Write the migration file**

```sql
-- 0014_household_owner_and_members.sql

alter table public.households
  add column if not exists owner_id uuid references auth.users (id);

-- Backfill: earliest member per household
update public.households h
set owner_id = m.user_id
from (
  select distinct on (household_id) household_id, user_id
  from public.household_members
  order by household_id, created_at asc, user_id asc
) m
where h.id = m.household_id
  and h.owner_id is null;

-- Orphan households without members: delete or leave nullable briefly
delete from public.households where owner_id is null;

alter table public.households
  alter column owner_id set not null;

create or replace function public.bootstrap_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.ensure_profile();

  select household_id into hid
  from public.household_members
  where user_id = auth.uid();
  if hid is not null then
    return hid;
  end if;

  insert into public.households (owner_id)
  values (auth.uid())
  returning id into hid;

  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid());

  insert into public.invites (household_id, code, expires_at)
  values (hid, encode(extensions.gen_random_bytes(16), 'hex'), now() + interval '7 days');

  return hid;
end;
$$;

create or replace function public.invite_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
  normalized text;
  target_id uuid;
  target_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  normalized := lower(btrim(p_email));
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or normalized ~ '@nido-lactancia\.local$' then
    raise exception 'invalid email';
  end if;

  select hm.household_id, h.owner_id into hid, owner
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  if owner is distinct from auth.uid() then
    raise exception 'not household owner';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = normalized
  limit 1;

  if target_id is not null then
    select household_id into target_household
    from public.household_members
    where user_id = target_id;

    if target_household = hid then
      return;
    end if;

    if target_household is not null then
      raise exception 'already in a household';
    end if;

    insert into public.household_members (household_id, user_id)
    values (hid, target_id);

    delete from public.email_invites
    where household_id = hid
      and email = normalized;
    return;
  end if;

  insert into public.email_invites (household_id, email, invited_by, created_at)
  values (hid, normalized, auth.uid(), now())
  on conflict (household_id, email)
  do update set invited_by = excluded.invited_by, created_at = now();
end;
$$;

create or replace function public.list_household_people()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', hm.user_id,
        'email', coalesce(p.email, ''),
        'is_owner', hm.user_id = h.owner_id,
        'is_self', hm.user_id = auth.uid()
      ) order by (hm.user_id = h.owner_id) desc, p.email asc)
      from public.household_members hm
      join public.households h on h.id = hm.household_id
      left join public.profiles p on p.id = hm.user_id
      where hm.household_id = hid
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', ei.email,
        'created_at', ei.created_at
      ) order by ei.created_at asc)
      from public.email_invites ei
      where ei.household_id = hid
    ), '[]'::jsonb)
  ) into result
  from public.households
  where id = hid;

  return result;
end;
$$;

create or replace function public.remove_household_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select hm.household_id, h.owner_id into hid, owner
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  if owner is distinct from auth.uid() then
    raise exception 'not household owner';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot remove self';
  end if;

  if p_user_id = owner then
    raise exception 'cannot remove owner';
  end if;

  delete from public.household_members
  where household_id = hid
    and user_id = p_user_id;

  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

create or replace function public.cancel_email_invite(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  normalized := lower(btrim(p_email));

  select hm.household_id, h.owner_id into hid, owner
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  if owner is distinct from auth.uid() then
    raise exception 'not household owner';
  end if;

  delete from public.email_invites
  where household_id = hid
    and email = normalized;

  if not found then
    raise exception 'invite not found';
  end if;
end;
$$;

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select hm.household_id, h.owner_id into hid, owner
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid();

  if hid is null then
    raise exception 'not in a household';
  end if;

  if owner = auth.uid() then
    raise exception 'owner cannot leave';
  end if;

  delete from public.household_members
  where household_id = hid
    and user_id = auth.uid();
end;
$$;

revoke all on function public.list_household_people() from public, anon, authenticated;
revoke all on function public.remove_household_member(uuid) from public, anon, authenticated;
revoke all on function public.cancel_email_invite(text) from public, anon, authenticated;
revoke all on function public.leave_household() from public, anon, authenticated;

grant execute on function public.list_household_people() to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
grant execute on function public.cancel_email_invite(text) to authenticated;
grant execute on function public.leave_household() to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0014_household_owner_and_members.sql
git commit -m "Add household owner and member management RPCs."
```

---

### Task 2: localClient + tests (TDD)

**Files:**
- Modify: `src/lib/localClient.ts`
- Modify: `src/lib/localClient.test.ts`

**Interfaces:**
- Consumes: same RPC names/args as Task 1
- Produces: `Database.households: { id, owner_id, created_at }[]`; bootstrap sets owner; invite/list/remove/cancel/leave match SQL rules

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/localClient.test.ts`:

```ts
  it("lists people, restricts invite to owner, and lets a member leave", async () => {
    const storage = memoryStorage();
    const owner = createLocalClient(storage);
    await owner.auth.signUp({ email: "mama@example.com", password: "secret1" });
    const household = await owner.rpc("bootstrap_household");
    expect(typeof household.data).toBe("string");

    const partner = createLocalClient(storage);
    await partner.auth.signUp({ email: "papa@example.com", password: "secret2" });
    await owner.auth.signInWithPassword({ email: "mama@example.com", password: "secret1" });
    await owner.rpc("invite_by_email", { p_email: "papa@example.com" });

    await partner.auth.signInWithPassword({ email: "papa@example.com", password: "secret2" });
    const asMemberInvite = await partner.rpc("invite_by_email", { p_email: "abuela@example.com" });
    expect(asMemberInvite.error?.message).toMatch(/not household owner/i);

    const listed = await partner.rpc("list_household_people");
    expect(listed.error).toBeNull();
    const people = listed.data as {
      members: { email: string; is_owner: boolean; is_self: boolean }[];
      pending: { email: string }[];
    };
    expect(people.members).toHaveLength(2);
    expect(people.members.some((m) => m.is_owner && m.email === "mama@example.com")).toBe(true);

    const left = await partner.rpc("leave_household");
    expect(left.error).toBeNull();
    const membership = await partner.from("household_members").select("household_id").maybeSingle();
    expect(membership.data).toBeNull();
  });

  it("rejects owner leave and allows owner remove", async () => {
    const storage = memoryStorage();
    const owner = createLocalClient(storage);
    await owner.auth.signUp({ email: "mama@example.com", password: "secret1" });
    await owner.rpc("bootstrap_household");
    const partner = createLocalClient(storage);
    await partner.auth.signUp({ email: "papa@example.com", password: "secret2" });
    await owner.auth.signInWithPassword({ email: "mama@example.com", password: "secret1" });
    await owner.rpc("invite_by_email", { p_email: "papa@example.com" });

    const ownerLeave = await owner.rpc("leave_household");
    expect(ownerLeave.error?.message).toMatch(/owner cannot leave/i);

    const partnerUser = (await partner.auth.getUser()).data.user;
    const removed = await owner.rpc("remove_household_member", { p_user_id: partnerUser!.id });
    expect(removed.error).toBeNull();
  });
```

Note: if `auth.getUser` is awkward in local client, resolve partner id from shared storage users by email instead — keep the assertion intent.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/localClient.test.ts`

Expected: FAIL — unknown RPCs / no owner.

- [ ] **Step 3: Implement localClient**

In `Database`, add:

```ts
type HouseholdRow = { id: string; owner_id: string; created_at: string };
// Database.households: HouseholdRow[]
```

Initialize `households: []` in empty DB.

In `bootstrap_household`: push `{ id: householdId, owner_id: userId, created_at: now }` and keep member insert.

In `invite_by_email`: load household by member; if `household.owner_id !== userId` return error `{ message: "not household owner" }`.

Add RPC handlers:

```ts
if (name === "list_household_people") {
  const member = db.members.find((item) => item.user_id === userId);
  if (!member) return { data: null, error: { message: "not in a household" } };
  const household = db.households.find((h) => h.id === member.household_id);
  const members = db.members
    .filter((m) => m.household_id === member.household_id)
    .map((m) => {
      const user = db.users.find((u) => u.id === m.user_id);
      return {
        user_id: m.user_id,
        email: user?.email ?? "",
        is_owner: m.user_id === household?.owner_id,
        is_self: m.user_id === userId,
      };
    });
  const pending = db.emailInvites
    .filter((i) => i.household_id === member.household_id)
    .map((i) => ({ email: i.email, created_at: i.created_at }));
  return { data: { members, pending }, error: null };
}
if (name === "remove_household_member") {
  // owner checks; delete member where user_id === args.p_user_id
}
if (name === "cancel_email_invite") {
  // owner checks; filter emailInvites
}
if (name === "leave_household") {
  // reject if owner; else splice member
}
```

Widen `rpc` args type to `Record<string, string>` still works for `p_user_id`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/localClient.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/localClient.ts src/lib/localClient.test.ts
git commit -m "Mirror household owner and member RPCs in the local client."
```

---

### Task 3: Errors + i18n

**Files:**
- Modify: `src/lib/errors.ts`
- Modify: `src/i18n/es.ts`

**Interfaces:**
- Produces Spanish strings for owner/leave/remove/cancel/confirm

- [ ] **Step 1: Add i18n keys** in `es.ts`:

```ts
  familyPeople: "Personas en el nido",
  familyOwner: "Creador",
  familyMember: "Miembro",
  familyYou: "vos",
  familyPending: "Invitación pendiente",
  familyOwnerOnly: "Solo la creadora puede invitar o quitar personas.",
  familyLeave: "Salir de la familia",
  familyLeaveConfirm: "¿Salir de esta familia? Vas a perder el acceso a los datos compartidos.",
  familyRemove: "Quitar",
  familyRemoveConfirm: "¿Quitar a esta persona de la familia?",
  familyCancelInvite: "Cancelar",
  familyCancelInviteConfirm: "¿Cancelar esta invitación?",
  familyTabFicha: "Ficha",
  notHouseholdOwner: "Solo quien creó la familia puede hacer eso.",
  ownerCannotLeave: "Quien creó la familia no puede salir. Pedile a alguien que te quite si hace falta.",
```

- [ ] **Step 2: Map errors** in `messageForError`:

```ts
  if (normalized.includes("not household owner")) {
    return es.notHouseholdOwner;
  }
  if (normalized.includes("owner cannot leave")) {
    return es.ownerCannotLeave;
  }
  if (normalized.includes("cannot remove self") || normalized.includes("cannot remove owner")) {
    return es.notHouseholdOwner;
  }
  if (normalized.includes("member not found") || normalized.includes("invite not found")) {
    return generic;
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/es.ts src/lib/errors.ts
git commit -m "Add Spanish copy for family member management."
```

---

### Task 4: Shell IA — Ficha tab + header Familia

**Files:**
- Modify: `src/lib/resume.ts`
- Create: `src/screens/FichaPanel.tsx`
- Create: `src/screens/FamilyPanel.tsx`
- Modify: `src/screens/TrackerScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `list_household_people`, `invite_by_email`, `remove_household_member`, `cancel_email_invite`, `leave_household`
- Produces: `TrackerScreen` props `onLeftHousehold: () => void`
- Produces: tabs `"today" | "history" | "ficha"`; Ficha holds baby name/birth edit + add baby (no vaccines yet)

- [ ] **Step 1: Extend resume tab**

In `resume.ts`, change `ResumeTab` to include `"ficha"` and parse:

```ts
tab: parsed.tab === "history" ? "history" : parsed.tab === "ficha" ? "ficha" : "today",
```

- [ ] **Step 2: Create `FichaPanel.tsx`**

Move the baby edit form + add-baby form from `TrackerScreen` collapsible into:

```tsx
type FichaPanelProps = {
  client: SupabaseClient;
  householdId: string;
  userId: string;
  timeZone: string;
  babies: Baby[];
  selected: Baby | null;
  onBabiesChange: (babies: Baby[]) => void;
  onSelectedIdChange: (id: string | null) => void;
  onError: (message: string | null) => void;
};
```

Render selected baby edit (name, born_on, save) and add-baby form. Keep existing validation/`trackAttempt` behavior from TrackerScreen.

- [ ] **Step 3: Create `FamilyPanel.tsx`**

```tsx
type FamilyPanelProps = {
  client: SupabaseClient;
  userId: string;
  onLeftHousehold: () => void;
  onClose: () => void;
};

type PeoplePayload = {
  members: { user_id: string; email: string; is_owner: boolean; is_self: boolean }[];
  pending: { email: string; created_at: string }[];
};
```

On mount: `client.rpc("list_household_people")`.  
Detect `isOwner` from member where `is_self && is_owner`.  
Owner: show remove/cancel/invite form.  
Member: show `es.familyOwnerOnly` + leave button with `confirm(es.familyLeaveConfirm)` then `leave_household` → `onLeftHousehold()`.  
Confirm before remove/cancel.

- [ ] **Step 4: Wire `TrackerScreen`**

- Add prop `onLeftHousehold`.
- State `familyOpen`; header row: title, button Familia, Salir.
- Tabs: Hoy / Historial / Ficha (`es.familyTabFicha`).
- When `tab === "ficha"`, render `<FichaPanel ... />`.
- When `familyOpen`, render `<FamilyPanel ... onClose={() => setFamilyOpen(false)} />`.
- Remove bottom Bebés/Familia collapsibles and invite form from TrackerScreen.

- [ ] **Step 5: Wire `App.tsx`**

Pass:

```tsx
onLeftHousehold={() => {
  // clear remembered household for this user if helpers exist
  setHouseholdId(null);
}}
```

Ensure leaving shows `FamilyScreen` again (existing `!householdId` branch). Clear resume household cache the same way sign-out / missing membership does — follow existing `rememberHousehold` helpers in `resume.ts` (add `forgetHousehold` if missing).

- [ ] **Step 6: Manual smoke (local mode)**

Run: `npm run dev` (or project’s local script), create family, invite second local user, verify list / leave / owner-only invite.

- [ ] **Step 7: Commit**

```bash
git add src/lib/resume.ts src/screens/FichaPanel.tsx src/screens/FamilyPanel.tsx src/screens/TrackerScreen.tsx src/App.tsx src/styles.css src/i18n/es.ts
git commit -m "Move family to the header and baby edit into a Ficha tab."
```

---

### Task 5: Apply live migration

**Files:**
- Live Supabase project (not in git)

- [ ] **Step 1: Apply** `0014_household_owner_and_members.sql` to the Nido lactancia Supabase project (CLI `supabase db push` or SQL editor).

- [ ] **Step 2: Verify**

```bash
npm run check:live-schema
```

Expected: PASS (this migration adds RPC/column; REST select of existing app columns still 200). Optionally REST/RPC smoke: call `list_household_people` as authenticated user returns 200 JSON.

- [ ] **Step 3: Commit** only if any check scripts changed (usually none). Note in PR that migration was applied.

---

## Plan self-review

- Spec coverage: owner_id, list/remove/cancel/leave, owner-only invite, header Familia, Ficha for babies, leave → FamilyScreen — covered. Vaccines deferred to sibling plan.
- No TBD placeholders in steps.
- RPC names consistent across migration, localClient, FamilyPanel.
