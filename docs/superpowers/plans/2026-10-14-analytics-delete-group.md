# Analytics delete / group / dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire Firebase analytics for feed/diaper/weight deletes, feed session group/ungroup, and feed-pair dismiss.

**Architecture:** Extend the allowlisted schema in `src/lib/analytics.ts` with six result events (`result: ok|error`). Call `trackAttempt` / `trackRejected` from existing UI handlers; no product behavior changes.

**Tech Stack:** TypeScript, Vitest, existing `trackAttempt` / `trackRejected` helpers, gtag via `analytics.ts`.

## Global Constraints

- One event per action: `feed_deleted`, `diaper_deleted`, `weight_deleted`, `feeds_grouped`, `feeds_ungrouped`, `feed_pair_dismissed`.
- All six are result events only (`result: ok|error`); no `source` param.
- Cancelled confirm dialogs must not emit events.
- One `feeds_grouped` per group operation (ok if all writes succeed; error on first failure).
- Do not change existing events or add invite-accept / day-picker tracking.
- Spec: `docs/superpowers/specs/2026-10-14-analytics-delete-group-design.md`.

## File map

- Modify: `src/lib/analytics.ts` — schema allowlist
- Modify: `src/lib/analytics.test.ts` — schema tests
- Modify: `src/screens/TodayPanel.tsx` — delete / group / ungroup / dismiss
- Modify: `src/screens/HistoryPanel.tsx` — group / ungroup / dismiss
- Modify: `src/screens/WeightSection.tsx` — weight delete

---

### Task 1: Schema + tests (TDD)

**Files:**
- Modify: `src/lib/analytics.ts`
- Modify: `src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `buildAnalyticsEvent("feed_deleted" | "diaper_deleted" | "weight_deleted" | "feeds_grouped" | "feeds_ungrouped" | "feed_pair_dismissed", { result: "ok" | "error" })` returns a clean event
- Produces: those names accepted as `save_failed.action` values (via `actions` list)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/analytics.test.ts` inside `describe("buildAnalyticsEvent")`:

```ts
  it("keeps result for delete, group, and dismiss events", () => {
    for (const name of [
      "feed_deleted",
      "diaper_deleted",
      "weight_deleted",
      "feeds_grouped",
      "feeds_ungrouped",
      "feed_pair_dismissed",
    ] as const) {
      expect(buildAnalyticsEvent(name, { result: "ok", side: "left" })).toEqual({
        name,
        params: { result: "ok" },
      });
      expect(buildAnalyticsEvent(name, {})).toBeNull();
    }
  });

  it("allows the new actions on save_failed", () => {
    expect(
      buildAnalyticsEvent("save_failed", { action: "feed_deleted", reason: "unavailable" }),
    ).toEqual({ name: "save_failed", params: { action: "feed_deleted", reason: "unavailable" } });
    expect(
      buildAnalyticsEvent("save_failed", { action: "feeds_grouped", reason: "conflict" }),
    ).toEqual({ name: "save_failed", params: { action: "feeds_grouped", reason: "conflict" } });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/analytics.test.ts`

Expected: FAIL — unknown event names / action not in allowlist.

- [ ] **Step 3: Extend `analytics.ts`**

In `actions`, append after `weight_logged`:

```ts
  "feed_deleted",
  "diaper_deleted",
  "weight_deleted",
  "feeds_grouped",
  "feeds_ungrouped",
  "feed_pair_dismissed",
```

In `resultEvents`, append the same six names.

In `schema`, add:

```ts
  feed_deleted: { required: ["result"], fields: { result: results } },
  diaper_deleted: { required: ["result"], fields: { result: results } },
  weight_deleted: { required: ["result"], fields: { result: results } },
  feeds_grouped: { required: ["result"], fields: { result: results } },
  feeds_ungrouped: { required: ["result"], fields: { result: results } },
  feed_pair_dismissed: { required: ["result"], fields: { result: results } },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/analytics.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts src/lib/analytics.test.ts
git commit -m "$(cat <<'EOF'
Allow analytics events for delete, group, and dismiss.

EOF
)"
```

---

### Task 2: TodayPanel call sites

**Files:**
- Modify: `src/screens/TodayPanel.tsx`

**Interfaces:**
- Consumes: `trackAttempt(name, ok, error)` from `../lib/analytics` (already imported)
- Produces: events from `removeFeed`, `removeDiaper`, `groupFeeds`, `ungroup`, `dismissPair`

- [ ] **Step 1: Wire deletes**

Replace `removeFeed` / `removeDiaper` so they capture `run` and track:

```ts
  async function removeFeed(id: string) {
    if (!window.confirm(es.confirmDeleteFeed)) return;
    const saved = await run(() => client.from("feeds").delete().eq("id", id));
    trackAttempt("feed_deleted", saved.ok, saved.error);
  }

  async function removeDiaper(id: string) {
    if (!window.confirm(es.confirmDeleteDiaper)) return;
    const saved = await run(() => client.from("diapers").delete().eq("id", id));
    trackAttempt("diaper_deleted", saved.ok, saved.error);
  }
```

- [ ] **Step 2: Wire group / ungroup / dismiss**

Replace the three handlers:

```ts
  async function groupFeeds(chosen: Feed[]) {
    const sessionId = assignSessionId(chosen, () => crypto.randomUUID());
    if (!sessionId) return;
    setError(null);
    for (const feed of chosen) {
      if (feed.session_id === sessionId) continue;
      const { error: writeError } = await client.from("feeds").update({ session_id: sessionId }).eq("id", feed.id);
      if (writeError) {
        setError(messageForError(writeError));
        setTick((value) => value + 1);
        trackAttempt("feeds_grouped", false, writeError);
        return;
      }
    }
    trackAttempt("feeds_grouped", true);
    setSelectedIds(new Set());
    setTick((value) => value + 1);
  }

  async function ungroup(sessionId: string) {
    const saved = await run(() => client.from("feeds").update({ session_id: null }).eq("session_id", sessionId).eq("baby_id", baby.id));
    trackAttempt("feeds_ungrouped", saved.ok, saved.error);
    if (saved.ok) setSelectedIds(new Set());
  }

  async function dismissPair(earlierId: string, laterId: string) {
    const saved = await run(() =>
      client.from("feed_pair_dismissals").insert({
        household_id: baby.household_id,
        earlier_feed_id: earlierId,
        later_feed_id: laterId,
      }),
    );
    trackAttempt("feed_pair_dismissed", saved.ok, saved.error);
  }
```

- [ ] **Step 3: Sanity check**

Run: `npm test -- src/lib/analytics.test.ts`

Expected: PASS (no UI unit tests for these handlers; schema coverage from Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/screens/TodayPanel.tsx
git commit -m "$(cat <<'EOF'
Track delete, group, and dismiss analytics on Hoy.

EOF
)"
```

---

### Task 3: HistoryPanel + WeightSection call sites

**Files:**
- Modify: `src/screens/HistoryPanel.tsx`
- Modify: `src/screens/WeightSection.tsx`

**Interfaces:**
- Consumes: `trackAttempt` from `../lib/analytics`
- Produces: History group/ungroup/dismiss + weight delete events

- [ ] **Step 1: Import and wire HistoryPanel**

Add import:

```ts
import { trackAttempt } from "../lib/analytics";
```

Replace `groupFeeds`, `ungroup`, `dismissPair` to match TodayPanel semantics:

```ts
  async function groupFeeds(chosen: Feed[]) {
    const sessionId = assignSessionId(chosen, () => crypto.randomUUID());
    if (!sessionId) return;
    setError(null);
    for (const feed of chosen) {
      if (feed.session_id === sessionId) continue;
      const { error: writeError } = await client.from("feeds").update({ session_id: sessionId }).eq("id", feed.id);
      if (writeError) {
        setError(messageForError(writeError));
        setTick((value) => value + 1);
        trackAttempt("feeds_grouped", false, writeError);
        return;
      }
    }
    trackAttempt("feeds_grouped", true);
    setSelectedIds(new Set());
    setTick((value) => value + 1);
  }

  async function ungroup(sessionId: string) {
    const { error: writeError } = await client.from("feeds").update({ session_id: null }).eq("session_id", sessionId).eq("baby_id", baby.id);
    if (writeError) {
      setError(messageForError(writeError));
      trackAttempt("feeds_ungrouped", false, writeError);
      setSelectedIds(new Set());
      setTick((value) => value + 1);
      return;
    }
    trackAttempt("feeds_ungrouped", true);
    setSelectedIds(new Set());
    setTick((value) => value + 1);
  }

  async function dismissPair(earlierId: string, laterId: string) {
    const { error: writeError } = await client.from("feed_pair_dismissals").insert({
      household_id: baby.household_id,
      earlier_feed_id: earlierId,
      later_feed_id: laterId,
    });
    if (writeError) {
      setError(messageForError(writeError));
      trackAttempt("feed_pair_dismissed", false, writeError);
      setTick((value) => value + 1);
      return;
    }
    trackAttempt("feed_pair_dismissed", true);
    setTick((value) => value + 1);
  }
```

Note: keep HistoryPanel's existing tick/error behavior; only add `trackAttempt` around the same writes. Prefer the block above so success and failure both track once.

- [ ] **Step 2: Wire WeightSection `remove`**

`trackAttempt` is not imported yet — WeightSection already imports `trackRejected, trackSaved`. Change to:

```ts
import { trackAttempt, trackRejected, trackSaved } from "../lib/analytics";
```

Replace `remove`:

```ts
  async function remove(id: string) {
    if (!window.confirm(es.confirmDeleteWeight)) return;
    setError(null);
    const { error: deleteError } = await client.from("weights").delete().eq("id", id);
    if (deleteError) {
      setError(messageForError(deleteError));
      trackAttempt("weight_deleted", false, deleteError);
      return;
    }
    trackAttempt("weight_deleted", true);
    setTick((value) => value + 1);
  }
```

Do **not** track the opportunistic delete inside save when `previousId !== saved.id` (that is cleanup during upsert, not a user delete action).

- [ ] **Step 3: Run analytics tests**

Run: `npm test -- src/lib/analytics.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/screens/HistoryPanel.tsx src/screens/WeightSection.tsx
git commit -m "$(cat <<'EOF'
Track group, dismiss, and weight-delete analytics.

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Six named result events in schema | Task 1 |
| `actions` / `resultEvents` / `save_failed` | Task 1 |
| TodayPanel deletes + group/ungroup/dismiss | Task 2 |
| HistoryPanel group/ungroup/dismiss | Task 3 |
| WeightSection delete | Task 3 |
| Cancelled confirm = no event | Task 2/3 early `return` before track |
| One `feeds_grouped` per op | Task 2/3 |
| No change to `weight_logged` / invite accept | Out of plan steps |
