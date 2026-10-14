# Analytics for delete / group / dismiss — design

## Goal

Track the user actions that already exist in the app but were missing from Firebase analytics: deletes, session group/ungroup, and dismiss of a feed-pair suggestion.

## Non-goals

- New UI or product behavior changes
- Changing existing events (`weight_logged` stays the event for length saves)
- Tracking invite accept, day picker, or baby switch
- GA property / dashboard setup

## Event names

One event per action (same naming style as `feed_logged` / `diaper_logged`):

| Event | When |
|-------|------|
| `feed_deleted` | User deletes a feed |
| `diaper_deleted` | User deletes a diaper |
| `weight_deleted` | User deletes a weight/length day row |
| `feeds_grouped` | User groups feeds into a session |
| `feeds_ungrouped` | User ungroups a session |
| `feed_pair_dismissed` | User dismisses a suggested feed pair |

## Schema shape

All six are **result events**: required `result` with values `ok` | `error`. No `source` param.

Wire them like `baby_created`:

1. Add names to `actions` and `resultEvents` in `src/lib/analytics.ts`.
2. Add `schema` entries: `{ required: ["result"], fields: { result: results } }`.
3. Client validation failures → `trackRejected(name)`.
4. Write success / failure → `trackAttempt(name, ok, error)`.

`save_failed` then covers errors via the existing `trackAttempt` / `trackRejected` helpers (`action` must include the new names).

## Call sites

| Location | Events |
|----------|--------|
| `TodayPanel` | `feed_deleted`, `diaper_deleted`, `feeds_grouped`, `feeds_ungrouped`, `feed_pair_dismissed` |
| `HistoryPanel` | `feeds_grouped`, `feeds_ungrouped`, `feed_pair_dismissed` |
| `WeightSection` | `weight_deleted` |

For multi-step group updates: fire **one** `feeds_grouped` for the whole operation (ok if all writes succeed; error on first write failure). Same for ungroup (single update already).

## Tests

Extend `analytics.test.ts` so `buildAnalyticsEvent` accepts each new name with `result: "ok"` and rejects unknown params / missing `result`.

## Out of scope follow-ups

- `bottle_logged` unused `source: "new"` enum value (leave as-is)
