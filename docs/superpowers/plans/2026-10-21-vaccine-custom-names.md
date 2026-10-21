# Vaccine custom / carnet names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional carnet display name on catalogue vaccine rows, plus free-text custom vaccines shown under **Otras** on Ficha.

**Architecture:** Extend `baby_vaccinations` so `catalog_id` is nullable; add `display_name` (override for catalogue) and `custom_name` (custom rows). XOR check + partial unique on `(baby_id, catalog_id)`. UI keeps Pendientes/Hechas for catalogue; appends **Otras** for customs. Apply migration live before deploy.

**Tech Stack:** Supabase SQL migration + RLS unchanged, TypeScript/React, Vitest, `localClient`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-21-vaccine-custom-names-design.md`
- Exactly one of catalogue vs custom per row; `display_name` only with catalogue
- Custom vaccines only under **Otras** (not mixed into calendar stages)
- Spanish UI via `es.ts`
- Apply live migration; `npm run check:live-schema` must pass before deploy
- Work on feature branch; land with rebase + squash

## File map

- Create: `supabase/migrations/0022_vaccine_custom_names.sql`
- Modify: `src/domain.ts`
- Modify: `src/lib/vaccines.ts`, `src/lib/vaccines.test.ts`
- Modify: `src/lib/localClient.ts`, `src/lib/localClient.test.ts`
- Modify: `src/screens/VaccinesSection.tsx`
- Modify: `src/i18n/es.ts`

---

### Task 1: Migration 0022

**Files:**
- Create: `supabase/migrations/0022_vaccine_custom_names.sql`

**Interfaces:**
- Produces nullable `catalog_id`, columns `display_name`, `custom_name`, XOR check, partial unique index

- [ ] **Step 1: Write migration**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git checkout -b feature/vaccine-custom-names
git add supabase/migrations/0022_vaccine_custom_names.sql
git commit -m "$(cat <<'EOF'
Allow custom vaccine names and optional carnet labels in schema.

EOF
)"
```

---

### Task 2: Domain + merge helpers (TDD)

**Files:**
- Modify: `src/domain.ts` (`BabyVaccination`)
- Modify: `src/lib/vaccines.ts`
- Modify: `src/lib/vaccines.test.ts`

**Interfaces:**
- `BabyVaccination`: `catalog_id: string | null`, `display_name: string | null`, `custom_name: string | null`
- `MergedVaccine`:
  ```ts
  export type MergedVaccine =
    | {
        kind: "catalog";
        catalog: VaccineCatalogItem;
        displayName: string | null;
        status: "pending" | "done";
        given_on: string | null;
        lot_number: string | null;
        rowId: string | null;
      }
    | {
        kind: "custom";
        customName: string;
        status: "pending" | "done";
        given_on: string | null;
        lot_number: string | null;
        rowId: string;
      };
  ```
- `mergeVaccineRows(...)` — catalogue merge only; map `display_name` → `displayName`; **ignore** rows with `custom_name` / null `catalog_id`
- `customVaccineRows(rows: BabyVaccination[]): MergedVaccine[]` — rows where `custom_name` trim non-empty; `kind: "custom"`
- `vaccineTitle(item: MergedVaccine): string` — customName, or displayName, or catalog.name

- [ ] **Step 1: Extend failing tests in `vaccines.test.ts`**

```ts
import { customVaccineRows, mergeVaccineRows, vaccineTitle, visibleStagesForBaby } from "./vaccines";

// keep existing visibleStages / merge pending tests; update merge expectations to include kind + displayName: null

it("uses display_name as title override for catalogue rows", () => {
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
  const rows = [
    {
      id: "r1",
      baby_id: "b1",
      catalog_id: "c1",
      display_name: "BCG - carnet",
      custom_name: null,
      status: "done" as const,
      given_on: "2026-09-26",
      lot_number: null,
    },
  ];
  const merged = mergeVaccineRows(catalog, rows, ["newborn"]);
  expect(merged[0]).toMatchObject({
    kind: "catalog",
    displayName: "BCG - carnet",
    status: "done",
    rowId: "r1",
  });
  expect(vaccineTitle(merged[0]!)).toBe("BCG - carnet");
});

it("lists custom rows separately and ignores them in mergeVaccineRows", () => {
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
  const rows = [
    {
      id: "r2",
      baby_id: "b1",
      catalog_id: null,
      display_name: null,
      custom_name: "Fiebre amarilla",
      status: "done" as const,
      given_on: "2026-01-01",
      lot_number: "L1",
    },
  ];
  expect(mergeVaccineRows(catalog, rows, ["newborn"])[0]?.rowId).toBeNull();
  const customs = customVaccineRows(rows);
  expect(customs).toEqual([
    {
      kind: "custom",
      customName: "Fiebre amarilla",
      status: "done",
      given_on: "2026-01-01",
      lot_number: "L1",
      rowId: "r2",
    },
  ]);
  expect(vaccineTitle(customs[0]!)).toBe("Fiebre amarilla");
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/vaccines.test.ts`

- [ ] **Step 3: Implement domain + `vaccines.ts`**

Update `BabyVaccination` fields. Rewrite `mergeVaccineRows` to set `kind: "catalog"`, `displayName: row?.display_name ?? null`, and only index rows with non-null `catalog_id`. Add `customVaccineRows` and `vaccineTitle`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/vaccines.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/domain.ts src/lib/vaccines.ts src/lib/vaccines.test.ts
git commit -m "$(cat <<'EOF'
Add vaccine merge helpers for carnet labels and custom doses.

EOF
)"
```

---

### Task 3: localClient constraints + tests

**Files:**
- Modify: `src/lib/localClient.ts` (`BabyVaccinationRow`, `constraintError` for vaccinations)
- Modify: `src/lib/localClient.test.ts` (insert custom; reject bad XOR; allow two customs; duplicate catalog still 23505)

**Interfaces:**
- Row type: `catalog_id: string | null`, `display_name: string | null`, `custom_name: string | null`
- Duplicate check only when `catalog_id != null`
- Reject if XOR violated (mirror SQL check); message `baby_vaccinations_catalog_xor_custom`

- [ ] **Step 1: Update `BabyVaccinationRow` and `constraintError`**

```ts
// duplicate only if catalog_id is non-null
const catalogId = row.catalog_id ?? null;
const customName = row.custom_name == null ? null : String(row.custom_name).trim() || null;
const displayName = row.display_name == null ? null : String(row.display_name).trim() || null;
const catalogOk = catalogId != null && customName == null;
const customOk = catalogId == null && displayName == null && customName != null;
if (!catalogOk && !customOk) {
  return { code: "23514", message: "baby_vaccinations_catalog_xor_custom" };
}
if (catalogId != null) {
  const duplicate = db.babyVaccinations.find(
    (item) => item.baby_id === row.baby_id && item.catalog_id === catalogId && item.id !== ignoreId,
  );
  if (duplicate) return { code: "23505", message: "baby_vaccinations_baby_id_catalog_id_key" };
}
```

Normalize on insert/update: store trimmed nulls for empty strings if other tables do similar; otherwise leave as written by UI.

- [ ] **Step 2: Add/adjust localClient tests** — custom insert OK; two customs OK; catalog+custom_name rejected; second same catalog_id 23505

- [ ] **Step 3: Run** `npx vitest run src/lib/localClient.test.ts src/lib/vaccines.test.ts` — PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/localClient.ts src/lib/localClient.test.ts
git commit -m "$(cat <<'EOF'
Enforce vaccine catalogue XOR custom rules in localClient.

EOF
)"
```

---

### Task 4: VaccinesSection UI + i18n

**Files:**
- Modify: `src/i18n/es.ts`
- Modify: `src/screens/VaccinesSection.tsx`

**Interfaces:**
- Select columns: `id, baby_id, catalog_id, display_name, custom_name, status, given_on, lot_number`
- Groups: Pendientes (catalogue pending), Hechas (catalogue done), **Otras** (`customVaccineRows`)
- Catalogue form: add optional carnet name field; save includes `display_name`
- **Agregar vacuna** form: `custom_name` required, status/date/lot; insert with `catalog_id: null`, `display_name: null`
- Custom row edit + **Borrar** (delete by `rowId`)
- Titles via `vaccineTitle`
- Editing key: catalogue → `catalog.id`; custom → `rowId`

- [ ] **Step 1: Add `es` keys**

```ts
  vaccineCarnetName: "Nombre en el carnet",
  vaccineAddCustom: "Agregar vacuna",
  vaccineCustomName: "Nombre de la vacuna",
  vaccineOtherGroup: "Otras",
  vaccineNeedCustomName: "Ingresá el nombre de la vacuna.",
  vaccineDeleteCustom: "Borrar",
  confirmDeleteCustomVaccine: "¿Borrar esta vacuna?",
```

(Reuse `es.vaccineOptional` next to carnet name.)

- [ ] **Step 2: Wire `VaccinesSection`**

Load → `mergeVaccineRows` + `customVaccineRows`. Render three groups (filter empty). Catalogue `VaccineForm` gains `displayName` state and passes to save. Add `addingCustom` UI with required name. Custom list items open form; save updates; delete confirms then `client.from("baby_vaccinations").delete().eq("id", rowId)`.

Catalogue save payload:

```ts
{
  baby_id: baby.id,
  catalog_id: item.catalog.id,
  custom_name: null,
  display_name: displayName.trim() || null,
  status,
  given_on: givenOn || null,
  lot_number: lot.trim() || null,
  updated_by: userId,
  updated_at: new Date().toISOString(),
}
```

Custom insert payload:

```ts
{
  baby_id: baby.id,
  catalog_id: null,
  display_name: null,
  custom_name: name.trim(),
  status,
  given_on: givenOn || null,
  lot_number: lot.trim() || null,
  updated_by: userId,
  updated_at: new Date().toISOString(),
}
```

- [ ] **Step 3: Run** `npx vitest run` — PASS

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es.ts src/screens/VaccinesSection.tsx
git commit -m "$(cat <<'EOF'
Add carnet name field and custom vaccines under Otras.

EOF
)"
```

---

### Task 5: Apply live migration + schema check

**Files:** none in git beyond verifying selects already updated in Task 4

- [ ] **Step 1:** Apply `0022_vaccine_custom_names.sql` on live Nido Supabase (SQL Editor).

- [ ] **Step 2:** REST `baby_vaccinations?select=id,catalog_id,display_name,custom_name&limit=1` → 200

- [ ] **Step 3:** `npm run check:live-schema` → PASS

- [ ] **Step 4:** Commit nothing if only live apply; if any select string was missed, fix + commit. Note in report.

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Schema nullable catalog + display/custom + XOR + partial unique | 1, 3 |
| Carnet override on catalogue | 2, 4 |
| Custom under Otras | 2, 4 |
| Add / edit / delete custom | 4 |
| Live migration + live-schema | 5 |
| Spanish chrome | 4 |

## Self-review notes

- Current Vacunas UI groups **Pendientes / Hechas** (not life stages); Otras is a third group after those — matches “at the end”.
- `mergeVaccineRows` must not put custom rows into catalogue map (null catalog_id).
- Partial unique index name may differ from old constraint; localClient error message can keep `baby_vaccinations_baby_id_catalog_id_key` for 23505.
