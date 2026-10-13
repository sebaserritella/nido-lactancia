# Baby length with weight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log baby length (cm) in the same day form as weight, with weight-only history unchanged.

**Architecture:** Extend `public.weights` with nullable `length_mm`, make `grams` nullable, enforce at-least-one measure. Reuse `WeightSection` + upsert-by-day. Parse/format cm↔mm in `src/lib/length.ts` mirroring `weight.ts`. Sync `localClient` checks and apply migration on live Supabase before deploy.

**Tech Stack:** Supabase SQL migrations, React, Vitest, localClient mock.

## Global Constraints

- Same form/date; weight and length each optional; at least one required.
- UI Spanish via `es.ts`; store `length_mm` integer; UI cm with up to 1 decimal.
- Length bounds 200–1200 mm; grams bounds unchanged when present.
- Keep analytics event `weight_logged`.
- Do not rename `weights` or add a lengths table.
- Apply migration on live Supabase before/with Pages; `check:live-schema` must not be skipped.
- Existing weight-only rows must keep working.

## File map

- Create: `supabase/migrations/0013_weight_length.sql`
- Create: `src/lib/length.ts`, `src/lib/length.test.ts`
- Modify: `src/domain.ts` — `Weight.grams` / `length_mm` nullable
- Modify: `src/lib/localClient.ts` + `src/lib/localClient.test.ts`
- Modify: `src/screens/WeightSection.tsx`
- Modify: `src/i18n/es.ts`
- Modify: `src/lib/errors.ts` (length check messages)

---

### Task 1: length helpers (TDD)

**Files:**
- Create: `src/lib/length.ts`
- Create: `src/lib/length.test.ts`

**Interfaces:**
- Produces: `centimetersToMillimeters(input: string): number | null`
- Produces: `formatCentimeters(lengthMm: number): string` (es-AR style, up to 1 decimal)

- [x] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { centimetersToMillimeters, formatCentimeters } from "./length";

describe("centimeters and millimeters", () => {
  it("converts centimeters with up to one decimal into millimeters", () => {
    expect(centimetersToMillimeters("52")).toBe(520);
    expect(centimetersToMillimeters("52,5")).toBe(525);
    expect(centimetersToMillimeters("52.5")).toBe(525);
    expect(centimetersToMillimeters(" 52,5 ")).toBe(525);
    expect(centimetersToMillimeters("20")).toBe(200);
    expect(centimetersToMillimeters("120")).toBe(1200);
  });

  it("rejects empty, out of range, and bad input", () => {
    expect(centimetersToMillimeters("")).toBeNull();
    expect(centimetersToMillimeters("19,9")).toBeNull();
    expect(centimetersToMillimeters("120,1")).toBeNull();
    expect(centimetersToMillimeters("52,55")).toBeNull();
    expect(centimetersToMillimeters("abc")).toBeNull();
  });

  it("formats millimeters as centimeters", () => {
    expect(formatCentimeters(520)).toBe("52,0");
    expect(formatCentimeters(525)).toBe("52,5");
  });
});
```

- [x] **Step 2: Run — expect FAIL**

Run: `npm test -- src/lib/length.test.ts`

- [x] **Step 3: Implement `length.ts`**

Mirror `weight.ts`: normalize comma→dot; pattern `^\d+(\.\d)?$`; mm = whole*10 + tenths; bounds 200–1200 inclusive; `formatCentimeters` like kg helper with one decimal digit.

- [x] **Step 4: Run — expect PASS**

---

### Task 2: Migration + localClient + domain

**Files:**
- Create: `supabase/migrations/0013_weight_length.sql`
- Modify: `src/domain.ts`
- Modify: `src/lib/localClient.ts` (`WeightRow`, `constraintError` for weights)
- Modify: `src/lib/localClient.test.ts`

**Interfaces:**
- Produces: SQL column `length_mm`; `grams` nullable; checks `weights_grams_check`, `weights_length_mm_check`, `weights_measure_present`
- Produces: localClient accepts weight-only, length-only, both; rejects both-null / bad length

- [x] **Step 1: Extend localClient tests**

Keep existing weight-only replace-same-day test. Add:
- insert length-only (`grams: null`, `length_mm: 525`) succeeds
- insert both succeeds
- insert both null / missing measure fails `23514`
- insert `length_mm: 199` fails `23514`
- weight-only insert still succeeds (regression)

- [x] **Step 2: Run localClient tests — expect FAIL on new cases**

- [x] **Step 3: Migration SQL**

```sql
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
```

- [x] **Step 4: Update domain + localClient validation**

`Weight.grams: number | null`, `length_mm: number | null`.  
`WeightRow` same. In `constraintError` for weights:
- treat missing `length_mm` as null
- if grams not null: integer in (0, 30000)
- if length_mm not null: integer in [200, 1200]
- if both null: `weights_measure_present`
- keep duplicate day `23505`

- [x] **Step 5: Run localClient tests — expect PASS**

---

### Task 3: UI + i18n + errors

**Files:**
- Modify: `src/i18n/es.ts`
- Modify: `src/lib/errors.ts`
- Modify: `src/screens/WeightSection.tsx`

**Interfaces:**
- Consumes: `centimetersToMillimeters`, `formatCentimeters`, nullable Weight fields
- Produces: form save with optional kg/cm; list shows present measures

- [x] **Step 1: Update Spanish copy**

- `weightTitle`: "Peso y largo"
- `addWeight`: "Cargar medida"
- `noWeights`: "Todavía no hay medidas."
- `editWeight`: "Corregir"
- `deleteWeight`: "Borrar"
- `confirmDeleteWeight`: "¿Borrar esta medida?"
- `weightCm`: "Centímetros"
- `cm`: "cm"
- `invalidLength`: "Ingresá el largo en centímetros, con hasta 1 decimal. Por ejemplo 52,5."
- `needWeightOrLength`: "Ingresá el peso, el largo, o ambos."

- [x] **Step 2: Map DB length check in `errors.ts`**

If message includes `length` and code `23514` → `es.invalidLength`.  
If message includes `measure_present` → `es.needWeightOrLength`.  
Keep existing weight `23514` → `invalidWeight`.

- [x] **Step 3: Update `WeightSection`**

- Select columns: `id, household_id, baby_id, weighed_on, grams, length_mm`
- Form: date + kg + cm (neither `required` on inputs; validate in save)
- Save: trim both; if both empty → `needWeightOrLength` + `trackRejected("weight_logged")`; parse each if non-empty; upsert with nulls allowed
- List: show kg and/or cm; edit prefills present values only
- Keep `weight_logged` analytics

- [x] **Step 4: Run full test suite**

Run: `npm test`

- [x] **Step 5: Apply migration on live Supabase and confirm REST select includes `length_mm` (200, not 42703)**

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Same form, optional fields, at least one | 3 |
| `length_mm`, nullable grams, checks | 2 |
| cm UI / mm storage | 1 |
| Compatibility weight-only | 2, 3 |
| localClient + tests | 2 |
| live migration + schema check columns | 3 |
| Keep `weight_logged` | 3 |
| No rename / no charts | n/a (out of scope) |
