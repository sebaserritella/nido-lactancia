# Baby length (largo) with weight — design

## Goal

Let caregivers log baby **length** in the same day-based form as **weight**: same date, weight only, length only, or both. Existing weight-only history must keep working.

## Non-goals

- Separate lengths table or rename of `weights`
- Growth charts, percentiles, WHO curves
- New analytics event names
- English UI copy (app stays Spanish via `es.ts`)

## Product rules

- Same form and same calendar day as weight.
- `grams` and length are each optional; **at least one** must be present to save.
- Empty form (both blank) is rejected in the client with a clear Spanish error.
- Delete removes the whole day row (weight and/or length).

## Data

Keep table `public.weights`. Migration (next free number, e.g. `0013_weight_length.sql`):

1. Add nullable `length_mm integer`.
2. Drop / replace the `grams` NOT NULL + check so that:
   - `grams` is nullable;
   - when `grams` is not null: `grams > 0 and grams < 30000` (same bounds as today);
   - when `length_mm` is not null: `length_mm >= 200 and length_mm <= 1200` (20–120 cm);
   - row check: `grams is not null or length_mm is not null`.
3. Keep `unique (baby_id, weighed_on)`, RLS policies, grants, and realtime publication unchanged (table name unchanged).

Storage unit for length: **millimetres** (integer), parallel to grams. UI unit: **centimetres**, up to one decimal (e.g. `52,5` → `525`).

Domain type (conceptual):

```ts
type Weight = {
  id: string;
  household_id: string;
  baby_id: string;
  weighed_on: string;
  grams: number | null;
  length_mm: number | null;
};
```

## Client

- Extend `WeightSection` (no new screen): title **“Peso y largo”**; form fields date + kilos + cm; list shows whichever values exist.
- Copy updates in `src/i18n/es.ts` (title, add/edit/delete/empty/invalid length / need-at-least-one). Buttons: “Cargar medida”, “Corregir”, “Borrar” (wording may stay close to weight where natural).
- Parsing/formatting: keep `src/lib/weight.ts`; add `src/lib/length.ts` (`centimetersToMillimeters` / `formatCentimeters`) with bounds 200–1200 mm.
- Select/upsert columns include `length_mm`. Upsert still `onConflict: "baby_id,weighed_on"`.
- Edit: prefill present fields; clearing one field is allowed if the other remains.
- Analytics: keep event `weight_logged` (new/edit/reject) — no new event.
- `localClient`: accept nullable `grams` / `length_mm` with the same checks as Postgres; existing weight-only inserts must still pass.

## Compatibility (must not break old data)

- Existing rows keep their `grams`; after migration `length_mm` is null. List UI shows only kg for those rows.
- Saving weight without length remains the default path.
- Making `grams` nullable must not rewrite or delete historical rows.
- Tests: keep weight-only insert/upsert/replace-same-day coverage; add length-only and both; add reject-when-both-null.
- Deploy: apply migration on live Supabase before/with the Pages build that selects `length_mm`. Confirm REST select of new columns returns 200 (not `42703`). `npm run check:live-schema` must include the new column and must not be skipped.

## Files to touch (implementation)

- `supabase/migrations/0013_*.sql` (or next free number)
- `src/domain.ts`
- `src/screens/WeightSection.tsx`
- `src/i18n/es.ts`
- `src/lib/length.ts` + `src/lib/length.test.ts`
- `src/lib/localClient.ts` + `src/lib/localClient.test.ts`
- `src/lib/liveSchema.test.ts` (if it asserts weight columns)
- `src/lib/errors.ts` only if new DB codes need Spanish mapping
- Weight-related tests that assume `grams: number` non-null

## Testing

- Unit: cm ↔ mm parse/format and bounds; weight helpers unchanged.
- localClient: weight-only (regression), length-only, both, both-null reject, duplicate day upsert.
- Manual/smoke after live migration: load old weight row; add length to same day; add length-only day; edit/clear one field.

## Out of scope

- Approach B/C (separate table / rename)
- Changing RLS or realtime setup beyond what the new column requires
- Backfilling length for past days
