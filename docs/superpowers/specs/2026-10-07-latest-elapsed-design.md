# Latest feed/diaper elapsed label — design

## Goal

In Última toma / Último pañal, show how long ago the event was, in Spanish, instead of (only) a clock stamp when under 24 hours.

## Copy

- Under 1 minute: `Hace menos de 1 minuto`
- Under 1 hour: `Hace 20 minutos` / `Hace 1 minuto`
- Under 24 hours: `Hace 2 horas y 40 minutos`; omit minutes when 0: `Hace 2 horas`; `Hace 1 hora y 1 minuto`
- 24 hours or more: keep the existing calendar stamp (`12:32`, `ayer 23:30`, `anteayer …`, `YYYY-MM-DD HH:mm`)

## Reference instants

- Diaper: `occurred_at`
- Finished breast feed: `ended_at` (line keeps duration minutes; drop start–end clocks)
- Bottle: `started_at` (keep `· N ml`)
- Open feed: no “Hace…”; show `En curso` / paused label as today

## Scope

- `src/lib/latestStamp.ts` (+ tests), `LatestSummary` usage via existing helpers
- Spanish strings in `es.ts` as needed
- No DB / migration changes
