# Success dialog after feed/diaper saves — design

## Goal

After a successful feed or diaper create/update on Hoy, show a modal that confirms what was saved, with a short rich summary, until the user taps **Listo**.

## UX

- Modal: dimmed overlay + centered card (app colors: `#fffdf9`, rounded corners).
- Content: title, 2–3 detail lines, primary button **Listo**.
- Close only via **Listo** (no outside tap, no auto-dismiss).
- On write error: no modal; keep existing `error` message path.

## When it shows

Pass an optional success payload into `run()`. Show the dialog only when the write succeeds **and** a payload was provided.

**With success**

- `startFeed` — toma empezada
- `stopFeed` — toma terminada / guardada
- `saveFeed` — alta pasada or edición
- `saveBottle` — alta or edición
- `logDiaper` — pañal rápido (ahora)
- `savePastDiaper` — pañal pasado
- `saveDiaper` — edición de pañal

**Without success** (unchanged silence)

- `pauseFeed` / `resumeFeed`
- group / ungroup / dismiss pair
- `removeFeed` / `removeDiaper`

## Copy shape

`SuccessNotice = { title: string; lines: string[] }`

Examples (Spanish, via `es.ts` + existing labels):

| Action | Title | Lines (illustrative) |
| --- | --- | --- |
| Stop / save breast | Toma guardada / Toma actualizada | Izquierdo · 10:00–10:12 · 12 min |
| Start breast | Toma empezada | Derecho · desde 10:00 |
| Bottle | Mamadera guardada / actualizada | 120 ml · 10:30 |
| Diaper | Pañal guardado / actualizado | Pis · 10:15 |

Reuse `sideLabel`, `diaperLabel`, `formatMinutes`, and local time formatting already used on Hoy.

## Wiring

- State on `TodayPanel`: `success: SuccessNotice | null`.
- Extend `run(action, success?: SuccessNotice | (() => SuccessNotice))`:
  - clear error, run action
  - on error → `setError`, return `{ ok: false }`
  - on ok → `setTick`, if `success` provided → `setSuccess(...)`, return `{ ok: true }`
- Lazy `() => SuccessNotice` so copy is built only after a successful write.
- New `SuccessDialog` component: props `notice`, `onClose`.
- Small copy helpers (panel-local or `src/lib/successCopy.ts`) unit-tested for breast + diaper (and bottle if cheap).

## Out of scope

- History panel (no feed/diaper create/edit there)
- Weight, auth, family, babies
- Toasts / auto-dismiss
- Database / migrations
- Changing analytics events beyond existing `track*` calls

## Files (expected)

- `src/screens/TodayPanel.tsx` — `run` + call sites + render dialog
- `src/components/SuccessDialog.tsx` — modal UI
- `src/styles.css` — overlay / dialog
- `src/i18n/es.ts` — titles and “Listo”
- `src/lib/successCopy.ts` (+ test) — optional if helpers are non-trivial
