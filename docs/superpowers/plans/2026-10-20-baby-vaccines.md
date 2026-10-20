# Baby vaccines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DB-backed Argentine national vaccine catalogue with per-baby optional date/lot, editable by any household member, shown on the Ficha tab grouped by life stage.

**Architecture:** Seed `vaccine_catalog` from [argentina.gob.ar/salud/vacunas](https://www.argentina.gob.ar/salud/vacunas); store doses in `baby_vaccinations` (lazy rows on first save); UI merges catalogue + rows inside `FichaPanel`. Client + CHECK reject future `given_on`.

**Tech Stack:** Supabase migrations + RLS, TypeScript/React, Vitest, `localClient`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-family-members-and-baby-vaccines-design.md` (vaccines sections).
- **Prerequisite:** `docs/superpowers/plans/2026-10-20-family-members.md` (Ficha tab + `FichaPanel` exist).
- Date and lot optional even when status is `done`.
- Any household member may edit.
- v1 Ficha stages: `newborn`, `up_to_1y`, `up_to_2y`, and `age_5` when baby age ≥ 5 years from `born_on`; never show pregnancy/adult stages on baby Ficha.
- Catalogue source: national calendar; update via new migration when the calendar changes — no in-app catalogue editor.
- Apply live migration; `npm run check:live-schema` must pass before deploy.
- Spanish UI via `es.ts`.

## File map

- Create: `supabase/migrations/0015_baby_vaccines.sql`
- Create: `src/lib/vaccines.ts` (merge catalogue + rows, stage filter by age)
- Create: `src/lib/vaccines.test.ts`
- Create: `src/screens/VaccinesSection.tsx`
- Modify: `src/domain.ts`
- Modify: `src/lib/localClient.ts`, `src/lib/localClient.test.ts`
- Modify: `src/lib/errors.ts`, `src/i18n/es.ts`
- Modify: `src/screens/FichaPanel.tsx`
- Modify: `src/lib/clientQueries.ts` / app selects if needed so live-schema sees new columns

---

### Task 1: Migration — catalogue + baby_vaccinations

**Files:**
- Create: `supabase/migrations/0015_baby_vaccines.sql`

**Interfaces:**
- Produces tables `vaccine_catalog`, `baby_vaccinations` with RLS for household members
- Produces seed rows for infant-relevant doses (and optional inactive/adult rows kept for future)

- [ ] **Step 1: Write migration**

```sql
-- 0015_baby_vaccines.sql

create table public.vaccine_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  life_stage text not null
    check (life_stage in (
      'pregnancy', 'newborn', 'up_to_1y', 'up_to_2y',
      'age_5', 'age_11', 'age_15_64', 'age_65_plus'
    )),
  due_label text not null,
  sort_order int not null,
  active boolean not null default true
);

create table public.baby_vaccinations (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  catalog_id uuid not null references public.vaccine_catalog (id) on delete restrict,
  status text not null check (status in ('pending', 'done')),
  given_on date,
  lot_number text,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (baby_id, catalog_id),
  constraint baby_vaccinations_given_on_not_future
    check (given_on is null or given_on <= (timezone('utc', now()))::date)
);

create index baby_vaccinations_baby_id on public.baby_vaccinations (baby_id);

alter table public.vaccine_catalog enable row level security;
alter table public.baby_vaccinations enable row level security;

-- Catalogue readable by any authenticated user
create policy vaccine_catalog_select on public.vaccine_catalog
  for select to authenticated using (true);

-- Baby vaccinations: household of baby
create policy baby_vaccinations_select on public.baby_vaccinations
  for select to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

create policy baby_vaccinations_insert on public.baby_vaccinations
  for insert to authenticated
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

create policy baby_vaccinations_update on public.baby_vaccinations
  for update to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

create policy baby_vaccinations_delete on public.baby_vaccinations
  for delete to authenticated
  using (
    exists (
      select 1 from public.babies b
      where b.id = baby_id
        and public.is_household_member(b.household_id)
    )
  );

grant select on public.vaccine_catalog to authenticated;
grant select, insert, update, delete on public.baby_vaccinations to authenticated;

-- Seed: Calendario Nacional (infant stages). Codes are stable.
insert into public.vaccine_catalog (code, name, life_stage, due_label, sort_order) values
  ('hepb_birth', 'Hepatitis B', 'newborn', 'Al nacer', 10),
  ('bcg_birth', 'BCG', 'newborn', 'Al nacer', 20),
  ('pneumo_2m', 'Neumococo', 'up_to_1y', '2 meses', 110),
  ('polio_2m', 'Polio', 'up_to_1y', '2 meses', 120),
  ('quintuple_2m', 'Quíntuple', 'up_to_1y', '2 meses', 130),
  ('rota_2m', 'Rotavirus', 'up_to_1y', '2 meses', 140),
  ('meningo_3m', 'Meningococo', 'up_to_1y', '3 meses', 150),
  ('pneumo_4m', 'Neumococo', 'up_to_1y', '4 meses', 160),
  ('polio_4m', 'Polio', 'up_to_1y', '4 meses', 170),
  ('quintuple_4m', 'Quíntuple', 'up_to_1y', '4 meses', 180),
  ('rota_4m', 'Rotavirus', 'up_to_1y', '4 meses', 190),
  ('meningo_5m', 'Meningococo', 'up_to_1y', '5 meses', 200),
  ('polio_6m', 'Polio', 'up_to_1y', '6 meses', 210),
  ('quintuple_6m', 'Quíntuple', 'up_to_1y', '6 meses', 220),
  ('flu_6_24_1', 'Antigripal', 'up_to_1y', '6 a 24 meses · 1ª', 230),
  ('flu_6_24_2', 'Antigripal', 'up_to_1y', '6 a 24 meses · 2ª', 240),
  ('pneumo_12m', 'Neumococo', 'up_to_1y', '12 meses', 250),
  ('hepa_12m', 'Hepatitis A', 'up_to_1y', '12 meses', 260),
  ('mmr_12m', 'Triple viral', 'up_to_1y', '12 meses', 270),
  ('meningo_15m', 'Meningococo', 'up_to_2y', '15 meses', 310),
  ('varicella_15m', 'Varicela', 'up_to_2y', '15 meses', 320),
  ('quintuple_15_18m', 'Quíntuple', 'up_to_2y', '15 a 18 meses', 330),
  ('mmr_5y', 'Triple viral', 'age_5', '5 años', 410),
  ('polio_5y', 'Polio', 'age_5', '5 años', 420),
  ('triple_bac_5y', 'Triple bacteriana', 'age_5', '5 años', 430);
```

If the official calendar listing for age 5 differs slightly, adjust names/labels to match https://www.argentina.gob.ar/salud/vacunas before committing — keep `code` stable.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0015_baby_vaccines.sql
git commit -m "Add vaccine catalogue and baby vaccination records."
```

---

### Task 2: Domain + merge helpers (TDD)

**Files:**
- Modify: `src/domain.ts`
- Create: `src/lib/vaccines.ts`
- Create: `src/lib/vaccines.test.ts`

**Interfaces:**
- Produces types `VaccineLifeStage`, `VaccineCatalogItem`, `BabyVaccination`
- Produces `visibleStagesForBaby(bornOn: string | null, today: string): VaccineLifeStage[]`
- Produces `mergeVaccineRows(catalog, rows, stages): MergedVaccine[]`

- [ ] **Step 1: Add types** to `domain.ts`:

```ts
export type VaccineLifeStage =
  | "pregnancy"
  | "newborn"
  | "up_to_1y"
  | "up_to_2y"
  | "age_5"
  | "age_11"
  | "age_15_64"
  | "age_65_plus";

export type VaccineCatalogItem = {
  id: string;
  code: string;
  name: string;
  life_stage: VaccineLifeStage;
  due_label: string;
  sort_order: number;
  active: boolean;
};

export type BabyVaccination = {
  id: string;
  baby_id: string;
  catalog_id: string;
  status: "pending" | "done";
  given_on: string | null;
  lot_number: string | null;
};
```

- [ ] **Step 2: Write failing tests** in `src/lib/vaccines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeVaccineRows, visibleStagesForBaby } from "./vaccines";

describe("visibleStagesForBaby", () => {
  it("always includes newborn through up_to_2y when born_on is set and under 5", () => {
    expect(visibleStagesForBaby("2026-03-12", "2026-10-20")).toEqual([
      "newborn",
      "up_to_1y",
      "up_to_2y",
    ]);
  });

  it("adds age_5 when the baby is at least 5 years old", () => {
    expect(visibleStagesForBaby("2020-01-01", "2026-10-20")).toContain("age_5");
  });

  it("still shows infant stages when born_on is null", () => {
    expect(visibleStagesForBaby(null, "2026-10-20")).toEqual([
      "newborn",
      "up_to_1y",
      "up_to_2y",
    ]);
  });
});

describe("mergeVaccineRows", () => {
  it("treats missing rows as pending without date or lot", () => {
    const catalog = [
      {
        id: "c1",
        code: "bcg_birth",
        name: "BCG",
        life_stage: "newborn" as const,
        due_label: "Al nacer",
        sort_order: 1,
        active: true,
      },
    ];
    const merged = mergeVaccineRows(catalog, [], ["newborn"]);
    expect(merged).toEqual([
      {
        catalog: catalog[0],
        status: "pending",
        given_on: null,
        lot_number: null,
        rowId: null,
      },
    ]);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test -- src/lib/vaccines.test.ts`

- [ ] **Step 4: Implement `vaccines.ts`**

```ts
import type { BabyVaccination, VaccineCatalogItem, VaccineLifeStage } from "../domain";

export type MergedVaccine = {
  catalog: VaccineCatalogItem;
  status: "pending" | "done";
  given_on: string | null;
  lot_number: string | null;
  rowId: string | null;
};

export function visibleStagesForBaby(bornOn: string | null, today: string): VaccineLifeStage[] {
  const base: VaccineLifeStage[] = ["newborn", "up_to_1y", "up_to_2y"];
  if (!bornOn) return base;
  const birth = new Date(`${bornOn}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const years =
    now.getFullYear() -
    birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  if (years >= 5) return [...base, "age_5"];
  return base;
}

export function mergeVaccineRows(
  catalog: VaccineCatalogItem[],
  rows: BabyVaccination[],
  stages: VaccineLifeStage[],
): MergedVaccine[] {
  const byCatalog = new Map(rows.map((row) => [row.catalog_id, row]));
  return catalog
    .filter((item) => item.active && stages.includes(item.life_stage))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const row = byCatalog.get(item.id);
      return {
        catalog: item,
        status: row?.status ?? "pending",
        given_on: row?.given_on ?? null,
        lot_number: row?.lot_number ?? null,
        rowId: row?.id ?? null,
      };
    });
}

export function isFutureDate(givenOn: string, today: string): boolean {
  return givenOn > today;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test -- src/lib/vaccines.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/domain.ts src/lib/vaccines.ts src/lib/vaccines.test.ts
git commit -m "Add vaccine domain types and catalogue merge helpers."
```

---

### Task 3: localClient tables + save tests

**Files:**
- Modify: `src/lib/localClient.ts`
- Modify: `src/lib/localClient.test.ts`

**Interfaces:**
- Produces local tables `vaccineCatalog`, `babyVaccinations` with seed matching migration codes
- Query/insert/update via existing `from()` path with same column names

- [ ] **Step 1: Failing test**

```ts
  it("saves a baby vaccination with optional date and lot", async () => {
    const client = createLocalClient(memoryStorage());
    await client.auth.signUp({ email: "mama@example.com", password: "secret1" });
    const household = await client.rpc("bootstrap_household");
    const baby = await client
      .from("babies")
      .insert({ household_id: household.data, name: "Lola", born_on: "2026-03-12" })
      .select("id")
      .single();
    const catalog = await client.from("vaccine_catalog").select("id, code").eq("code", "bcg_birth").single();
    const babyId = (baby.data as { id: string }).id;
    const catalogId = (catalog.data as { id: string }).id;

    const saved = await client.from("baby_vaccinations").insert({
      baby_id: babyId,
      catalog_id: catalogId,
      status: "done",
      given_on: null,
      lot_number: null,
    });
    expect(saved.error).toBeNull();

    const withDate = await client.from("baby_vaccinations").insert({
      baby_id: babyId,
      catalog_id: (await client.from("vaccine_catalog").select("id").eq("code", "hepb_birth").single()).data!.id,
      status: "done",
      given_on: "2099-01-01",
      lot_number: "X",
    });
    expect(withDate.error).toBeTruthy();
  });
```

Adapt insert API to whatever `Query` supports (may need `.select` after insert). For future date, local Query should reject like CHECK.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement local tables**

Seed `vaccineCatalog` on empty DB with the same codes as migration (generate stable UUIDs or random once and persist).  
Support `from("vaccine_catalog")` select and `from("baby_vaccinations")` insert/update/select with future-date rejection and unique `(baby_id, catalog_id)`.

Set `updated_by` from session user on insert/update.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/localClient.ts src/lib/localClient.test.ts
git commit -m "Support vaccine catalogue and baby vaccinations in the local client."
```

---

### Task 4: VaccinesSection UI + Ficha wiring

**Files:**
- Create: `src/screens/VaccinesSection.tsx`
- Modify: `src/screens/FichaPanel.tsx`
- Modify: `src/i18n/es.ts`, `src/lib/errors.ts`
- Modify: `src/styles.css` if needed for contrast (dark text on light inputs)

**Interfaces:**
- Consumes: `vaccine_catalog` select, `baby_vaccinations` select/upsert, `mergeVaccineRows`, `visibleStagesForBaby`, `todayLocalDate`
- Produces: grouped list + editor form (status, optional date, optional lot)

- [ ] **Step 1: i18n**

```ts
  vaccines: "Vacunas",
  vaccineDone: "Hecha",
  vaccinePending: "Pendiente",
  vaccineGivenOn: "Fecha aplicada",
  vaccineLot: "Número de lote",
  vaccineOptional: "(opcional)",
  vaccineSaveDone: "Guardar",
  vaccineNoDateLot: "Sin fecha ni lote",
  vaccineFutureDate: "La fecha no puede ser futura.",
  vaccineStageNewborn: "Recién nacidos",
  vaccineStageUpTo1y: "Hasta 1 año",
  vaccineStageUpTo2y: "Hasta 2 años",
  vaccineStageAge5: "5 años",
```

Map `given_on` / future check failures in `errors.ts` if the DB message is distinctive; otherwise show `es.vaccineFutureDate` from client validation.

- [ ] **Step 2: Implement `VaccinesSection.tsx`**

Props: `client`, `baby`, `userId`, `timeZone`.

Load catalogue (`active = true`) and rows for `baby.id`.  
Merge with `visibleStagesForBaby(baby.born_on, todayLocalDate(timeZone))`.  
Group by `life_stage` with Spanish stage titles.  
Tap row → inline/editor: radio or toggle pending/done, date input, lot input, save.

Save logic:

```ts
const today = todayLocalDate(timeZone);
if (givenOn && isFutureDate(givenOn, today)) {
  setError(es.vaccineFutureDate);
  return;
}
const payload = {
  baby_id: baby.id,
  catalog_id: item.catalog.id,
  status,
  given_on: givenOn || null,
  lot_number: lot.trim() || null,
  updated_by: userId,
  updated_at: new Date().toISOString(),
};
if (item.rowId) {
  await client.from("baby_vaccinations").update(payload).eq("id", item.rowId);
} else {
  await client.from("baby_vaccinations").insert(payload);
}
```

Use high-contrast form styles (explicit dark text / light background) matching the approved mockup.

- [ ] **Step 3: Mount in `FichaPanel`** below baby edit:

```tsx
{selected ? <VaccinesSection client={client} baby={selected} userId={userId} timeZone={timeZone} /> : null}
```

- [ ] **Step 4: Ensure live-schema sees selects**

If the app selects `vaccine_catalog` / `baby_vaccinations` columns, confirm `queriedColumnsFromSources` picks them up from source strings (same pattern as other tables).

- [ ] **Step 5: Manual smoke**

Mark BCG done with no date/lot; edit with date+lot; try future date → blocked.

- [ ] **Step 6: Commit**

```bash
git add src/screens/VaccinesSection.tsx src/screens/FichaPanel.tsx src/i18n/es.ts src/lib/errors.ts src/styles.css
git commit -m "Show national vaccine checklist on the baby Ficha tab."
```

---

### Task 5: Apply live migration

- [ ] **Step 1: Apply** `0015_baby_vaccines.sql` on the live Nido Supabase project.

- [ ] **Step 2: Verify REST**

```bash
# catalogue
curl -s -o /dev/null -w "%{http_code}\n" \
  "$VITE_SUPABASE_URL/rest/v1/vaccine_catalog?select=id,code,name,life_stage,due_label,sort_order,active&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
# expect 200

npm run check:live-schema
```

Expected: PASS.

---

## Plan self-review

- Spec: DB catalogue, lazy rows, optional date/lot, any member edit, stage filtering, Ficha placement, live apply — covered.
- Prerequisite family plan called out.
- Seed codes/names align with national calendar infant schedule; age_5 set included for later ages.
- Types `VaccineCatalogItem` / `BabyVaccination` / `MergedVaccine` consistent across tasks.
