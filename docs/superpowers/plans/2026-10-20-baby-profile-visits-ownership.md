# Baby profile, pediatric visits, ownership transfer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Ficha with baby profile fields and pediatric visits (synced into Peso y altura), and let the household owner transfer creator to another member.

**Architecture:** Nullable columns on `babies`; `pediatric_visits` with RLS; client upserts `weights` on visit save when measures present; security-definer RPC `transfer_household_ownership`. WhatsApp via normalized `wa.me` digits. Build in three shippable phases.

**Tech Stack:** Supabase migrations + RLS, TypeScript/React, Vitest, `localClient`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-baby-profile-visits-ownership-design.md`
- Any household member edits profile and visits; only owner transfers.
- Visit with measure → upsert `weights` on `(baby_id, weighed_on = visited_on)`; no measure → do not touch weights; delete visit does not delete weight.
- Spanish UI via `es.ts`; apply each live migration before deploy; `npm run check:live-schema` must pass.
- Next migrations: `0017`, `0018`, `0019` (`0016` already exists).
- Also land uncommitted Ficha “Editar bebé” collapse if still dirty on the branch before UI tasks.

## File map

- Create: `supabase/migrations/0017_baby_profile_fields.sql`
- Create: `supabase/migrations/0018_pediatric_visits.sql`
- Create: `supabase/migrations/0019_transfer_household_ownership.sql`
- Create: `src/lib/whatsapp.ts`, `src/lib/whatsapp.test.ts`
- Create: `src/screens/VisitsSection.tsx`
- Modify: `src/domain.ts`
- Modify: `src/lib/localClient.ts`, `src/lib/localClient.test.ts`
- Modify: `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/i18n/es.ts`
- Modify: `src/screens/FichaPanel.tsx`, `src/screens/TrackerScreen.tsx` (`babyColumns`)
- Modify: `src/screens/FamilyPanel.tsx`

---

## Phase A — Baby profile

### Task 1: Migration — profile columns

**Files:**
- Create: `supabase/migrations/0017_baby_profile_fields.sql`

**Interfaces:**
- Produces nullable columns on `public.babies`: `pediatrician_name`, `pediatrician_phone`, `blood_type`, `allergies`, `health_insurance`

- [ ] **Step 1: Write migration**

```sql
-- 0017_baby_profile_fields.sql

alter table public.babies
  add column if not exists pediatrician_name text,
  add column if not exists pediatrician_phone text,
  add column if not exists blood_type text,
  add column if not exists allergies text,
  add column if not exists health_insurance text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0017_baby_profile_fields.sql
git commit -m "Add baby profile columns for pediatrician and health data."
```

---

### Task 2: Domain, WhatsApp helper, localClient, Ficha UI

**Files:**
- Modify: `src/domain.ts`
- Create: `src/lib/whatsapp.ts`, `src/lib/whatsapp.test.ts`
- Modify: `src/lib/localClient.ts` (BabyRow type / defaults if any)
- Modify: `src/i18n/es.ts`, `src/lib/errors.ts` (invalid WhatsApp phone)
- Modify: `src/screens/FichaPanel.tsx`, `src/screens/TrackerScreen.tsx`
- Test: `src/lib/whatsapp.test.ts`

**Interfaces:**
- Consumes: migration 0017 columns
- Produces:
  - `Baby` extended with five nullable string fields
  - `whatsappDigits(phone: string): string | null` — digits only; AR mobiles often need country `54` without leading `0` after `15` stripping — implement: strip non-digits; if starts with `0`, drop it; if length 10 and looks local mobile, prefix `54`; if already starts with `54`, keep; return null if fewer than 8 digits
  - `whatsappUrl(phone: string): string | null` → `https://wa.me/${digits}` or null
  - Shared select: `babyColumns = "id, household_id, name, born_on, pediatrician_name, pediatrician_phone, blood_type, allergies, health_insurance"`

- [ ] **Step 1: Failing WhatsApp tests**

```ts
import { describe, expect, it } from "vitest";
import { whatsappDigits, whatsappUrl } from "./whatsapp";

describe("whatsapp", () => {
  it("builds wa.me from an Argentine mobile", () => {
    expect(whatsappDigits("11 2345-6789")).toMatch(/^54/);
    expect(whatsappUrl("11 2345-6789")).toMatch(/^https:\/\/wa\.me\/54/);
  });

  it("rejects empty or too-short input", () => {
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits("123")).toBeNull();
    expect(whatsappUrl("abc")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `whatsapp.ts` + extend `Baby` + `babyColumns` + Ficha**

Extend `Baby` in `domain.ts` with the five `string | null` fields.

Implement `whatsapp.ts` as specified in Interfaces.

In `FichaPanel` / `TrackerScreen`, widen `babyColumns` and include profile fields in edit form + read-only display (omit empty). WhatsApp ghost button only when `whatsappUrl(phone)` is non-null; on click `window.open(url, "_blank", "noopener,noreferrer")`. Save updates all profile fields with name/birth.

Add `es` keys: `pediatrician`, `pediatricianPhone`, `bloodType`, `allergies`, `healthInsurance`, `openWhatsApp`, `invalidPhone`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/whatsapp.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain.ts src/lib/whatsapp.ts src/lib/whatsapp.test.ts src/i18n/es.ts src/lib/errors.ts src/screens/FichaPanel.tsx src/screens/TrackerScreen.tsx
git commit -m "Show baby health profile and WhatsApp link on Ficha."
```

---

### Task 3: Apply 0017 live

**Files:** none (ops)

- [ ] **Step 1: Apply** `0017_baby_profile_fields.sql` on live Supabase (SQL Editor).
- [ ] **Step 2: Confirm** REST select of new baby columns returns 200 (not 42703).
- [ ] **Step 3: Run** `npm run check:live-schema` — expect PASS.

---

## Phase B — Pediatric visits

### Task 4: Migration — `pediatric_visits`

**Files:**
- Create: `supabase/migrations/0018_pediatric_visits.sql`

**Interfaces:**
- Produces `public.pediatric_visits` with RLS for household members

- [ ] **Step 1: Write migration**

```sql
-- 0018_pediatric_visits.sql

create table public.pediatric_visits (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  visited_on date not null,
  reason text not null,
  notes text,
  grams integer,
  length_mm integer,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint pediatric_visits_grams_check
    check (grams is null or (grams > 0 and grams < 30000)),
  constraint pediatric_visits_length_mm_check
    check (length_mm is null or (length_mm >= 200 and length_mm <= 1200)),
  constraint pediatric_visits_measure_ok
    check (
      (grams is null and length_mm is null)
      or (grams is not null or length_mm is not null)
    ),
  constraint pediatric_visits_visited_on_not_future
    check (visited_on <= (timezone('utc', now()))::date)
);

create index pediatric_visits_baby_id on public.pediatric_visits (baby_id);

alter table public.pediatric_visits enable row level security;

create policy pediatric_visits_select on public.pediatric_visits
  for select to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

create policy pediatric_visits_insert on public.pediatric_visits
  for insert to authenticated
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

create policy pediatric_visits_update on public.pediatric_visits
  for update to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

create policy pediatric_visits_delete on public.pediatric_visits
  for delete to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and public.is_household_member(b.household_id)
    )
  );

grant select, insert, update, delete on public.pediatric_visits to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0018_pediatric_visits.sql
git commit -m "Add pediatric visits table."
```

---

### Task 5: Domain + localClient visit/weight sync + tests

**Files:**
- Modify: `src/domain.ts` — add `PediatricVisit` type
- Modify: `src/lib/localClient.ts` — table `pediatric_visits`, CHECKs mirroring migration; weights upsert already exists
- Modify: `src/lib/localClient.test.ts`
- Modify: `src/lib/errors.ts` — map `pediatric_visits_visited_on_not_future` like vaccine future date

**Interfaces:**
- Produces type:

```ts
export type PediatricVisit = {
  id: string;
  baby_id: string;
  visited_on: string;
  reason: string;
  notes: string | null;
  grams: number | null;
  length_mm: number | null;
};
```

- UI (Task 6) after insert/update visit: if `grams != null || length_mm != null`, call

```ts
await client.from("weights").upsert(
  {
    household_id: baby.household_id,
    baby_id: baby.id,
    weighed_on: visited_on,
    grams,
    length_mm: lengthMm,
  },
  { onConflict: "baby_id,weighed_on" },
);
```

- [ ] **Step 1: Failing localClient test**

```ts
it("rejects a future pediatric visit date", async () => {
  // create household + baby, insert visit with visited_on far future
  // expect error code 23514 / message includes visited_on_not_future
});

it("allows a visit without measures", async () => {
  // insert visit with grams/length null — ok
});
```

- [ ] **Step 2: Run — expect FAIL then implement localClient table + CHECKs**
- [ ] **Step 3: Run `npx vitest run src/lib/localClient.test.ts` — PASS**
- [ ] **Step 4: Commit**

```bash
git add src/domain.ts src/lib/localClient.ts src/lib/localClient.test.ts src/lib/errors.ts src/lib/errors.test.ts src/i18n/es.ts
git commit -m "Support pediatric visits in the local client."
```

---

### Task 6: `VisitsSection` UI on Ficha

**Files:**
- Create: `src/screens/VisitsSection.tsx`
- Modify: `src/screens/FichaPanel.tsx` — render below profile, above vaccines
- Modify: `src/i18n/es.ts` — visits copy
- Modify: `src/styles.css` only if needed (reuse vaccine/weight patterns)

**Interfaces:**
- Consumes: `PediatricVisit`, weight upsert pattern from Task 5
- Props: `{ client, baby, userId, timeZone }`

- [ ] **Step 1: Implement list + collapsed add + edit form**

Columns select: `id, baby_id, visited_on, reason, notes, grams, length_mm`.

Behavior per spec: list desc by date; add collapsed; form date/reason/kg/cm/notes; validate with `kilogramsToGrams` / `centimetersToMillimeters` / `needWeightOrLength` only when either kg or cm filled; reject future date with `todayLocalDate`; on successful visit write, upsert weights when measures present; delete visit optional with confirm — do not delete weight.

- [ ] **Step 2: Manual smoke or unit if easy — `npm test` PASS**
- [ ] **Step 3: Commit**

```bash
git add src/screens/VisitsSection.tsx src/screens/FichaPanel.tsx src/i18n/es.ts src/styles.css
git commit -m "Show pediatric visits on the baby Ficha tab."
```

---

### Task 7: Apply 0018 live

- [ ] Apply SQL; REST `pediatric_visits?select=id&limit=1` → 200; `npm run check:live-schema` PASS.

---

## Phase C — Ownership transfer

### Task 8: Migration — `transfer_household_ownership`

**Files:**
- Create: `supabase/migrations/0019_transfer_household_ownership.sql`
- Modify: `src/lib/localClient.ts` + tests
- Modify: `src/lib/errors.ts`, `src/i18n/es.ts`

**Interfaces:**
- Produces RPC `transfer_household_ownership(p_user_id uuid) returns void`

- [ ] **Step 1: Write migration**

```sql
-- 0019_transfer_household_ownership.sql

create or replace function public.transfer_household_ownership(p_user_id uuid)
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
    raise exception 'cannot transfer to self';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = hid and user_id = p_user_id
  ) then
    raise exception 'member not found';
  end if;

  update public.households
  set owner_id = p_user_id
  where id = hid;
end;
$$;

revoke all on function public.transfer_household_ownership(uuid) from public, anon, authenticated;
grant execute on function public.transfer_household_ownership(uuid) to authenticated;
```

- [ ] **Step 2: Failing localClient tests** — non-owner cannot transfer; owner can; target must be member; cannot transfer to self
- [ ] **Step 3: Implement RPC in `localClient`**
- [ ] **Step 4: Map errors** — `cannot transfer to self` → Spanish in `es.ts` / `errors.ts`
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_transfer_household_ownership.sql src/lib/localClient.ts src/lib/localClient.test.ts src/lib/errors.ts src/lib/errors.test.ts src/i18n/es.ts
git commit -m "Add transfer household ownership RPC."
```

---

### Task 9: FamilyPanel UI + apply 0019 live

**Files:**
- Modify: `src/screens/FamilyPanel.tsx`
- Modify: `src/i18n/es.ts` — `familyMakeOwner`, `familyMakeOwnerConfirm`

- [ ] **Step 1: Add owner-only button** next to remove (or instead of stacking awkwardly): **Hacer creador** with `confirm(es.familyMakeOwnerConfirm)`; call `client.rpc("transfer_household_ownership", { p_user_id })`; `loadPeople()` on success.
- [ ] **Step 2: `npm test` PASS**
- [ ] **Step 3: Apply 0019 live; verify RPC exists (call or SQL); `check:live-schema` PASS**
- [ ] **Step 4: Commit**

```bash
git add src/screens/FamilyPanel.tsx src/i18n/es.ts
git commit -m "Let the household creator transfer ownership from Familia."
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Profile columns + Ficha edit/read + WhatsApp | 1–3 |
| Visits table + UI + weight upsert | 4–7 |
| No weight delete on visit delete | 6 |
| Transfer RPC + Familia UI | 8–9 |
| Live migrations + live-schema | 3, 7, 9 |
| Non-goals (accept flow, reminders, etc.) | omitted |

No TBD placeholders. Types consistent: `PediatricVisit`, `babyColumns`, `transfer_household_ownership(p_user_id)`.
