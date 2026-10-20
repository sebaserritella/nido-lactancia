# Baby profile, pediatric visits, ownership transfer — design

## Goal

1. **Baby profile (Ficha):** store pediatrician name + phone (with WhatsApp open), blood type, allergies, and health insurance (`obra social`).
2. **Pediatric visits:** log visits with date, reason, optional weight/height, and notes. Saving a visit with a measure also upserts that day’s row in **Peso y altura**.
3. **Transfer creator:** the household owner can immediately transfer `owner_id` to another active member (confirm in UI).

Build order: profile fields → visits (+ weight sync) → ownership transfer.

## Non-goals (v1)

- New owner must accept the transfer
- Claiming ownership if the current owner is gone
- Future appointments / reminders
- Multiple pediatricians per baby
- Sync with Mi Argentina / official digital records
- Treating profile or visits as a medical/legal record

## Placement (IA)

| Surface | Content |
|---------|---------|
| **Ficha** | Selected baby: compact name + birth; **Editar bebé**; read-only profile fields; **Visitas al pediatra**; vaccines (unchanged) |
| **Familia** (header) | Existing people list + owner action **Hacer creador** on other members |

Permissions: any household member edits baby profile and visits (same as vaccines / baby name today). Only the current owner can transfer ownership.

## Data model

### `babies` (new nullable columns)

| Column | Type | Notes |
|--------|------|--------|
| `pediatrician_name` | text | |
| `pediatrician_phone` | text | Digits / local format; normalize for WhatsApp |
| `blood_type` | text | Free text (e.g. `A+`) |
| `allergies` | text | Free text |
| `health_insurance` | text | Obra social |

### `pediatric_visits`

- `id`, `baby_id` → `babies` (cascade)
- `visited_on` date not null
- `reason` text not null — UI requires non-empty; store trimmed text
- `notes` text nullable
- `grams` integer nullable, `length_mm` integer nullable — same check style as `weights` (at least one measure if either set)
- `updated_by`, `updated_at`
- RLS: household members via baby → household (same pattern as `baby_vaccinations` / `weights`)
- Realtime optional in v1 (reload/tick on save is enough; add publication if we subscribe)

### Visit → weight sync

When saving a visit that includes weight and/or height:

- Upsert `weights` on unique `(baby_id, weighed_on)` with `weighed_on = visited_on`, copying `grams` / `length_mm`, and household from the baby.
- If the visit has neither measure, do not touch `weights`.
- Editing a visit’s measures updates that day’s weight row the same way.
- Deleting a visit in v1: do **not** auto-delete the weight row (user may rely on Peso y altura independently).

### Ownership

- New RPC `transfer_household_ownership(p_user_id uuid)` (security definer):
  - Caller must be `households.owner_id`
  - Target must be a different active `household_members` row in the same household
  - Sets `households.owner_id = p_user_id`
- No change to membership rows other than who counts as owner in `list_household_people`.

## UI details

### Ficha — profile

- Default: show name + birth date + **Editar bebé** (existing pattern).
- Show filled profile fields as read-only text; omit empty fields entirely.
- If `pediatrician_phone` is present and normalizes to WhatsApp digits, show ghost **WhatsApp** → `https://wa.me/<digits>` (new tab / system handler). Invalid phone → Spanish error, do not open.
- **Editar bebé** expands one form: name, birth, and all profile fields; **Guardar** / **Cancelar**.

### Ficha — visits

- Section **Visitas al pediatra**: list by `visited_on` desc; row shows date, reason, optional weight/height meta.
- **Agregar visita** collapsed until tapped (same pattern as Agregar bebé).
- Form: date, reason, kg, cm, notes; validate measures like WeightSection; future `visited_on` rejected.
- Tap row to edit; cancel restores.

### Familia — transfer

- Owner sees **Hacer creador** on each other member (not self).
- Confirm copy: e.g. you will stop being the creator; they will become creator.
- On success, refresh people list; current user becomes member.

## Errors

- Permission / transfer failures: clear Spanish (`notHouseholdOwner`, member not found, cannot transfer to self).
- Invalid measure / future visit date: reuse or mirror weight / vaccine date copy.
- Generic save fallback unchanged for unexpected Postgres errors.

## Local / tests

- Extend `localClient` for new baby columns, `pediatric_visits`, weight upsert on visit save, `transfer_household_ownership`.
- Tests: profile update; visit with measure upserts weight; visit without measure leaves weights alone; transfer owner-only and target-must-be-member.
- Live: apply migrations; `npm run check:live-schema` before deploy.

## Out of scope follow-ups

- Accept / decline transfer
- Auto-remove weight when deleting a visit
- Reminders for next checkup
- Structured blood-type enum
