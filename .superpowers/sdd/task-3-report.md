# Task 3 report: Wire `run` + Hoy call sites

## Status
Complete.

## Changes (`src/screens/TodayPanel.tsx`)
- Added `success` state and optional second argument to `run` (notice or lazy thunk).
- Rendered `SuccessDialog` at the top of the panel root.
- Success notices: `startFeed`, `stopFeed`, `saveFeed`, `saveBottle`, `logDiaper`, `savePastDiaper`, `saveDiaper`.
- No success on: `pauseFeed`, `resumeFeed`, deletes, group/ungroup/dismiss.

## Tests
- `npm test -- src/lib/successCopy.test.ts` — PASS (3)
- `npx tsc --noEmit` — PASS
- `npm test` — PASS (100, 1 skipped)

## Manual (Hoy)
- Quick diaper → “Pañal guardado” modal.
- Past breast save → “Toma guardada” with side/span/minutes.
- Pause running feed → no modal.
- Invalid bottle ml → error only, no modal.

## Commit
Message: `Show a success dialog after feed and diaper saves on Hoy.`
