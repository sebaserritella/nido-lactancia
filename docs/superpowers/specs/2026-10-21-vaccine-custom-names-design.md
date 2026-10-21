# Vaccine custom / carnet names — design

## Goal

1. For a **catalogue** dose, optionally store the **name as written on the carnet** (display override) when it differs from the national calendar label.
2. Allow **custom vaccines** not in the catalogue, with a free-text name, same status / optional date / optional lot as catalogue rows.
3. Show custom vaccines in an **“Otras”** group at the end of Vacunas on Ficha.

## Non-goals (v1)

- Editing or extending the shared `vaccine_catalog` (national calendar stays seeded / migration-only)
- Matching / merging a custom row into a catalogue dose
- Per-household catalogue rows
- Sync with Mi Argentina or official digital carnet
- Renaming the catalogue label globally for all babies

## Placement

| Surface | Behavior |
|---------|----------|
| Ficha → Vacunas | Catalogue groups unchanged; new **Otras** after the last stage group |
| Catalogue row form | Existing status / date / lot + optional **Nombre en el carnet** |
| Custom | **Agregar vacuna** opens a form: name (required), status, optional date/lot; saves into Otras |
| Edit / delete | Custom rows editable and deletable; catalogue rows keep current edit pattern (no delete of untouched pending catalogue slots) |

## Data model

Extend `public.baby_vaccinations` (migration `0022_…`):

| Column | Change |
|--------|--------|
| `catalog_id` | Become **nullable** (was `not null`) |
| `display_name` | `text null` — carnet / local label for a **catalogue** row; if null/blank, UI shows `vaccine_catalog.name` |
| `custom_name` | `text null` — required for custom rows |

Constraints:

- Exactly one of: `catalog_id is not null` **xor** `custom_name is not null` (and trimmed non-empty for custom).
- When `catalog_id` is set: `custom_name` must be null; `display_name` optional.
- When `custom_name` is set: `catalog_id` and `display_name` must be null.
- Replace `unique (baby_id, catalog_id)` with a **partial unique** index on `(baby_id, catalog_id) where catalog_id is not null` so multiple custom rows per baby are allowed.
- Keep `status`, `given_on`, `lot_number`, `updated_by`, `updated_at`, future-date check, RLS, realtime as today.

`vaccine_catalog` unchanged.

## UI / copy (es)

- Chrome in `es.ts`: e.g. `vaccineCarnetName`, `vaccineCarnetNameOptional`, `vaccineAddCustom`, `vaccineCustomName`, `vaccineOtherGroup` (“Otras”), delete confirm for custom if needed.
- Catalogue list row title: `display_name` if set, else catalogue `name`; due label still from catalogue.
- Otras list row title: `custom_name`.
- Same permissions as today: any household member may edit.

## Client / local

- `localClient` + domain types: nullable `catalog_id`, new fields; merge logic: catalogue merge unchanged; append custom rows (those with `custom_name`) into an Otras group.
- Unit tests: constraint/mapping helpers; merge shows override label; custom appears only under Otras; partial unique allows two customs.

## Deploy

- Apply migration on live Supabase before/with Pages deploy that selects/writes the new columns.
- Confirm REST select of new columns returns 200 (not `42703`).
- `npm run check:live-schema` must include the new selected columns and must not be skipped.

## Errors

- Empty custom name → Spanish validation, no save.
- Future `given_on` → existing message.
- Generic save fallback unchanged; log real Postgres errors.

## Out of scope follow-ups

- Suggest linking custom → catalogue dose
- Import from photo/OCR of carnet
- Life-stage assignment for Otras
