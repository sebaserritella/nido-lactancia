# Family members + baby vaccines — design

## Goal

1. **Family members:** the household creator can see who is in the family (and pending invites), invite, cancel pending invites, and remove members. Invited members can see the same list but cannot edit membership; they can leave the household themselves.
2. **Baby vaccines:** a DB-backed catalogue from the [Calendario Nacional de Vacunación](https://www.argentina.gob.ar/salud/vacunas), with per-baby status. Date given and lot number are optional. Any household member can edit vaccines.

## Non-goals (v1)

- Transfer ownership or delete household
- Owner “leave” (would orphan the household)
- Invite/join by code UI (email invite stays)
- Adult / pregnancy life stages on the baby profile (catalogue may store them; UI shows infant-relevant stages only)
- Extra baby profile fields (allergies, pediatrician, etc.) — same Ficha surface later, not now
- Making vaccines a medical/legal record (no claims beyond family logging)

## Placement (IA)

Chosen option **C**:

| Surface | Content |
|---------|---------|
| Tabs | **Hoy · Historial · Ficha** |
| **Ficha** | Selected baby: name, `born_on`, edit, add baby, **Vaccines** grouped by life stage |
| Header | **Nido · Familia · Salir** — Familia opens a dedicated panel (not under Hoy) |

Remove the current bottom collapsibles for Bebés / Familia; that content moves into Ficha / header Familia.

## Permissions

| Action | Owner (`households.owner_id`) | Member |
|--------|-------------------------------|--------|
| See members + pending invites | yes | yes |
| Invite / cancel pending / remove member | yes | no |
| Leave household | no (v1) | yes |
| Edit baby name / birth | yes (unchanged: any member) | yes |
| Edit vaccines (status, optional date/lot) | yes | yes |

## Data model

### Family

- Add `households.owner_id uuid not null references auth.users` (or profiles), set in `bootstrap_household`.
- Backfill existing households: earliest `household_members.created_at` for that household.
- New security-definer RPCs:
  - `list_household_people()` — active members (email + is_owner + is_self) and pending `email_invites`
  - `remove_household_member(p_user_id)` — owner only; cannot remove self
  - `cancel_email_invite(p_email)` — owner only
  - `leave_household()` — non-owner only; deletes own membership row
- Tighten `invite_by_email`: require `auth.uid() = households.owner_id`.

Do **not** open `profiles` SELECT to all household members; emails come only through the list RPC.

### Vaccines

Source of truth for names/stages: https://www.argentina.gob.ar/salud/vacunas (and linked stage pages). Seed via migration.

- `vaccine_catalog`
  - `id`, `code` (stable), `name`, `life_stage` (`pregnancy` | `newborn` | `up_to_1y` | `up_to_2y` | `age_5` | `age_11` | `age_15_64` | `age_65_plus`), `due_label` (e.g. “2 meses”), `sort_order`, `active`
  - One row per scheduled dose (e.g. Neumococo 1ª / 2ª / refuerzo = separate rows)
- `baby_vaccinations`
  - `baby_id`, `catalog_id` (unique pair)
  - `status` (`pending` | `done`) — default pending when first touched, or derive “pending” as absence of row / explicit pending
  - `given_on date` nullable, `lot_number text` nullable
  - `updated_by`, `updated_at`
- RLS: household members full access via baby → household membership (same pattern as weights).
- Materialize `baby_vaccinations` rows lazily on first edit (UI merges active catalogue for infant stages with any saved row; untouched items appear as pending with no row).

**v1 UI stages for a baby:** `newborn`, `up_to_1y`, `up_to_2y`, and later `age_5` when age warrants (from `born_on`). Hide pregnancy/adult stages on the baby Ficha.

**Validation:** `given_on` must not be in the future if set. Date and lot both optional even when `status = done`.

## UI details

### Familia panel (from header)

- List members with labels: Creador / vos / Miembro
- Pending invites; owner sees Cancelar
- Owner: email invite form (existing copy, tightened permission)
- Member: short note that only the creator can invite/remove + **Salir de la familia**
- Confirm before remove / leave / cancel

### Ficha tab — vaccines

- Grouped by life stage
- Row: name, due label, status chip; if done, show date and/or lot when present (“Sin fecha ni lote” if neither)
- Tap → form: status done/pending, optional date, optional lot (contrast: dark text on light fields — approved in brainstorm mockups)
- Any member can save

## Errors

- Permission failures: clear Spanish copy (not only the generic save fallback)
- Network / Postgres failures: existing generic fallback in `errors.ts`; log real error
- After leave: same empty-household path as today (FamilyScreen / create household)

## Local / tests

- Extend `localClient` with owner, list/remove/leave/cancel, vaccine tables/RPCs as needed
- Unit tests: owner-only invite/remove; member leave; vaccine save with null date/lot; future date rejected
- Live: apply migrations; `npm run check:live-schema` before deploy

## Out of scope follow-ups

- Extra baby profile fields on Ficha
- Ownership transfer
- Showing full calendar stages (adult/pregnancy) in-app
- Sync with Mi Argentina / official digital carnet
