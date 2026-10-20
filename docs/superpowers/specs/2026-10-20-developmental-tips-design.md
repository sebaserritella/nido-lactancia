# Developmental tips (age band) — design

## Goal

Show **educational developmental surveillance tips** for the selected baby on **Ficha**, for the **current age band only**. Help caregivers know what is typically expected and when to ask the pediatrician. Not a diagnosis tool, checklist, or medical record.

## Non-goals (v1)

- Tips on **Hoy** or Historial
- Showing other age bands (no “ver todas las etapas”)
- Editable checklists, scores, or “pass/fail” UI
- Push / local notifications
- Database tables or sync
- Content past 24 months (section **hidden**)
- Linking vaccines (or aluminum / autism myths) to development tips
- Weight/length percentiles (already covered elsewhere)

## Placement

| Surface | Behavior |
|---------|----------|
| **Ficha** | New section **Desarrollo** for the selected baby, near Vacunas / Visitas |
| Visibility | Render only when `born_on` is set **and** completed calendar months ≤ 24 |
| Missing `born_on` | Section omitted (no empty placeholder) |
| Age > 24 months | Section omitted entirely |

## Age bands

Use `completedCalendarMonths(born_on, today)` from `src/lib/age.ts` (same calendar-month logic as the rest of the app). Map months → one band:

| Completed months | Band id | UI title (es) |
|------------------|---------|---------------|
| 0–3 | `m0_3` | 0 a 3 meses |
| 4–6 | `m4_6` | 4 a 6 meses |
| 7–10 | `m9` | Alrededor de 9 meses |
| 11–14 | `m12` | Alrededor de 12 meses |
| 15–20 | `m18` | Alrededor de 18 meses |
| 21–24 | `m24` | Alrededor de 24 meses |
| ≥ 25 | — | Section hidden |

Boundary rule: inclusive on the low end of each row as written (e.g. month 3 → `m0_3`; month 4 → `m4_6`; month 24 → `m24`).

`today` = household/local date via existing `todayLocalDate(timeZone)` (same as vaccines/age display).

## Content per band

Static copy in Spanish. Each band has:

1. **Esperable** — short bullet list (social, language, motor, play as relevant)
2. **Consultar si…** — red-flag style bullets (surveillance, not diagnosis)
3. **Qué mirar** — 3–4 short tip questions (e.g. respuesta al nombre, señalar, imitación)
4. **Disclaimer** (shared for all bands) — e.g. orientación general; no diagnostica; ante dudas, pediatra; una señal aislada no define nada; importa el patrón y si pierde habilidades.

Tone: calm, practical, same register as the rest of Nido (`es.ts`). No fear-mongering; no vaccine claims.

Source of truth for strings:
- **Chrome** in `es.ts`: section title, disclaimer, headings (“Esperable”, “Consultar si…”, “Qué mirar”).
- **Band bodies** in `src/lib/developmentTips.ts`: structured `{ title, expected, consultIf, tips }` per band id (Spanish constants), so `es.ts` stays short.

## UI

- Section title: **Desarrollo** (or `es.development`)
- Subtitle: current band title (e.g. “Alrededor de 9 meses”)
- Read-only stacked lists; reuse existing `.card` / `.stack` / muted text patterns — no new design system
- No forms, no save, no realtime

## Permissions

Any household member who can open Ficha for the baby can read the tips (same as viewing vaccines). No writes.

## Data / architecture

- No migration, no Supabase changes, no `check:live-schema` impact
- Pure client: `born_on` + `timeZone` → band → content
- Unit-test band mapping (months → band id / null when > 24)

## Errors

None beyond normal Ficha load. Invalid `born_on` already handled elsewhere; if age helpers return null, hide section.

## Testing

- Unit: month boundaries (0, 3, 4, 6, 7, 10, 11, 14, 15, 20, 21, 24, 25) → expected band or hidden
- Manual: baby with `born_on` in each band; baby > 24 months; baby without `born_on`

## Out of scope follow-ups

- Expand to show other bands on demand
- Hoy one-liner tip
- Content after 2 years
- Pediatric visit integration (“llevá estas dudas”)
