# Success Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful feed or diaper create/update on Hoy, show a modal with a rich Spanish summary until the user taps Listo.

**Architecture:** Pure copy helpers build a `SuccessNotice`. `TodayPanel.run` accepts an optional success payload (value or lazy thunk) and opens state on write ok. A presentational `SuccessDialog` renders overlay + card; close only via Listo. Pause/group/delete keep calling `run` without a payload.

**Tech Stack:** React 19, TypeScript, Vitest, existing `es.ts` / `formatMinutes` / `toDatetimeLocalValue` / `sideLabel` / `diaperLabel`.

## Global Constraints

- Modal only (no toast, no auto-dismiss, no outside-tap close).
- Show dialog only when write succeeds **and** `run` received a success payload.
- With success: `startFeed`, `stopFeed`, `saveFeed`, `saveBottle`, `logDiaper`, `savePastDiaper`, `saveDiaper`.
- Without success: pause/resume, group/ungroup/dismiss, delete feed/diaper.
- No History / weight / auth changes; no DB migrations; do not change analytics beyond existing `track*` calls.
- Copy in Spanish via `es.ts`.

## File map

- Create: `src/lib/successCopy.ts` — `SuccessNotice` + notice builders
- Create: `src/lib/successCopy.test.ts`
- Create: `src/components/SuccessDialog.tsx`
- Modify: `src/i18n/es.ts` — titles + Listo + `desde` helper fragment
- Modify: `src/styles.css` — overlay / dialog
- Modify: `src/screens/TodayPanel.tsx` — `run`, call sites, render dialog

---

### Task 1: Copy helpers + i18n

**Files:**
- Create: `src/lib/successCopy.ts`
- Create: `src/lib/successCopy.test.ts`
- Modify: `src/i18n/es.ts`

**Interfaces:**
- Produces: `export type SuccessNotice = { title: string; lines: string[] }`
- Produces: `breastStartedNotice(side, startedAtIso, timeZone): SuccessNotice`
- Produces: `breastSavedNotice({ side, startedAtIso, endedAtIso, minutes, updated, timeZone }): SuccessNotice`
- Produces: `bottleSavedNotice(ml, whenIso, timeZone, updated): SuccessNotice`
- Produces: `diaperSavedNotice(kind, whenIso, timeZone, updated): SuccessNotice`
- Clock fragment: `toDatetimeLocalValue(iso, timeZone).slice(11)` (same as `FeedLog`)

- [ ] **Step 1: Add i18n strings**

In `src/i18n/es.ts`, add:

```ts
done: "Listo",
feedStartedTitle: "Toma empezada",
feedSavedTitle: "Toma guardada",
feedUpdatedTitle: "Toma actualizada",
bottleSavedTitle: "Mamadera guardada",
bottleUpdatedTitle: "Mamadera actualizada",
diaperSavedTitle: "Pañal guardado",
diaperUpdatedTitle: "Pañal actualizado",
sinceTime: (when: string) => `desde ${when}`,
```

- [ ] **Step 2: Write failing tests**

Create `src/lib/successCopy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bottleSavedNotice,
  breastSavedNotice,
  breastStartedNotice,
  diaperSavedNotice,
} from "./successCopy";

const tz = "America/Argentina/Buenos_Aires";

describe("successCopy", () => {
  it("builds a started breast notice", () => {
    const notice = breastStartedNotice("right", "2026-10-13T13:00:00.000Z", tz);
    expect(notice.title).toBe("Toma empezada");
    expect(notice.lines[0]).toContain("Derecho");
    expect(notice.lines[0]).toMatch(/desde \d{2}:\d{2}/);
  });

  it("builds a finished breast notice with minutes", () => {
    const notice = breastSavedNotice({
      side: "left",
      startedAtIso: "2026-10-13T13:00:00.000Z",
      endedAtIso: "2026-10-13T13:12:00.000Z",
      minutes: 12,
      updated: false,
      timeZone: tz,
    });
    expect(notice.title).toBe("Toma guardada");
    expect(notice.lines.join(" ")).toContain("Izquierdo");
    expect(notice.lines.join(" ")).toContain("12 min");
  });

  it("builds bottle and diaper notices", () => {
    expect(bottleSavedNotice(120, "2026-10-13T13:30:00.000Z", tz, true).title).toBe("Mamadera actualizada");
    expect(diaperSavedNotice("pee", "2026-10-13T13:15:00.000Z", tz, false).title).toBe("Pañal guardado");
    expect(diaperSavedNotice("pee", "2026-10-13T13:15:00.000Z", tz, false).lines.join(" ")).toContain("Pis");
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test -- src/lib/successCopy.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 4: Implement `successCopy.ts`**

```ts
import type { DiaperKind, FeedSide } from "../domain";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import { formatMinutes } from "./format";
import { toDatetimeLocalValue } from "./localTime";

export type SuccessNotice = { title: string; lines: string[] };

function clock(iso: string, timeZone: string): string {
  return toDatetimeLocalValue(iso, timeZone).slice(11);
}

export function breastStartedNotice(side: FeedSide, startedAtIso: string, timeZone: string): SuccessNotice {
  return {
    title: es.feedStartedTitle,
    lines: [`${sideLabel(side)} · ${es.sinceTime(clock(startedAtIso, timeZone))}`],
  };
}

export function breastSavedNotice(args: {
  side: FeedSide;
  startedAtIso: string;
  endedAtIso: string | null;
  minutes: number | null;
  updated: boolean;
  timeZone: string;
}): SuccessNotice {
  const start = clock(args.startedAtIso, args.timeZone);
  const span = args.endedAtIso ? `${start}–${clock(args.endedAtIso, args.timeZone)}` : start;
  const mins = formatMinutes(args.minutes);
  const detail = mins ? `${sideLabel(args.side)} · ${span} · ${mins}` : `${sideLabel(args.side)} · ${span}`;
  return {
    title: args.updated ? es.feedUpdatedTitle : es.feedSavedTitle,
    lines: [detail],
  };
}

export function bottleSavedNotice(ml: number, whenIso: string, timeZone: string, updated: boolean): SuccessNotice {
  return {
    title: updated ? es.bottleUpdatedTitle : es.bottleSavedTitle,
    lines: [`${ml} ${es.ml} · ${clock(whenIso, timeZone)}`],
  };
}

export function diaperSavedNotice(kind: DiaperKind, whenIso: string, timeZone: string, updated: boolean): SuccessNotice {
  return {
    title: updated ? es.diaperUpdatedTitle : es.diaperSavedTitle,
    lines: [`${diaperLabel(kind)} · ${clock(whenIso, timeZone)}`],
  };
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test -- src/lib/successCopy.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/successCopy.ts src/lib/successCopy.test.ts src/i18n/es.ts
git commit -m "$(cat <<'EOF'
Add Spanish success-notice copy helpers for feeds and diapers.

EOF
)"
```

---

### Task 2: SuccessDialog UI + CSS

**Files:**
- Create: `src/components/SuccessDialog.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `SuccessNotice` from `../lib/successCopy`
- Produces: `<SuccessDialog notice={SuccessNotice} onClose={() => void} />`
- Close only via Listo button (no overlay click handler)

- [ ] **Step 1: Add CSS**

Append to `src/styles.css`:

```css
.success-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: rgba(36, 28, 24, 0.35);
}

.success-dialog {
  width: min(22rem, 100%);
  display: grid;
  gap: 12px;
  padding: 20px 16px 16px;
  background: #fffdf9;
  border-radius: 18px;
  box-shadow: 0 8px 28px rgba(36, 28, 24, 0.12);
}

.success-dialog h2 {
  margin: 0;
  font-size: 1.15rem;
}

.success-dialog .success-lines {
  margin: 0;
  display: grid;
  gap: 4px;
}

.success-dialog .success-lines p {
  margin: 0;
  color: #6e625a;
}
```

- [ ] **Step 2: Implement component**

Create `src/components/SuccessDialog.tsx`:

```tsx
import { es } from "../i18n/es";
import type { SuccessNotice } from "../lib/successCopy";

type SuccessDialogProps = {
  notice: SuccessNotice;
  onClose: () => void;
};

export function SuccessDialog({ notice, onClose }: SuccessDialogProps) {
  return (
    <div className="success-overlay" role="presentation">
      <div className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-title">
        <h2 id="success-title">{notice.title}</h2>
        <div className="success-lines">
          {notice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <button type="button" onClick={onClose}>
          {es.done}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-check types**

Run: `npx tsc --noEmit`

Expected: PASS (or only pre-existing unrelated errors — none expected)

- [ ] **Step 4: Commit**

```bash
git add src/components/SuccessDialog.tsx src/styles.css
git commit -m "$(cat <<'EOF'
Add SuccessDialog modal shell for save confirmations.

EOF
)"
```

---

### Task 3: Wire `run` + Hoy call sites

**Files:**
- Modify: `src/screens/TodayPanel.tsx`

**Interfaces:**
- Consumes: `SuccessDialog`, notice builders from Task 1–2
- Changes: `run(action, success?: SuccessNotice | (() => SuccessNotice))`
- On ok + success provided → `setSuccess(typeof success === "function" ? success() : success)`
- Render `{success ? <SuccessDialog notice={success} onClose={() => setSuccess(null)} /> : null}` near the top of the panel return (inside the root)

- [ ] **Step 1: Extend state and `run`**

```ts
import { SuccessDialog } from "../components/SuccessDialog";
import {
  bottleSavedNotice,
  breastSavedNotice,
  breastStartedNotice,
  diaperSavedNotice,
  type SuccessNotice,
} from "../lib/successCopy";
import { activeMinutes } from "../lib/feedDuration"; // if not already imported

const [success, setSuccess] = useState<SuccessNotice | null>(null);

async function run(
  action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  successNotice?: SuccessNotice | (() => SuccessNotice),
): Promise<{ ok: boolean; error: { code?: string; message?: string } | null }> {
  setError(null);
  const { error: writeError } = await action();
  if (writeError) {
    setError(messageForError(writeError));
    return { ok: false, error: writeError };
  }
  setTick((value) => value + 1);
  if (successNotice) {
    setSuccess(typeof successNotice === "function" ? successNotice() : successNotice);
  }
  return { ok: true, error: null };
}
```

- [ ] **Step 2: Pass success into the listed call sites**

```ts
// startFeed — after building insert payload times:
const startedAt = new Date().toISOString();
const saved = await run(
  () => client.from("feeds").insert({ /* ... started_at: startedAt, side ... */ }),
  () => breastStartedNotice(side, startedAt, timeZone),
);

// stopFeed — capture open before update; use ended now + activeMinutes after closePause conceptually:
const now = Date.now();
const endedAt = new Date(now).toISOString();
const closed = closePause(open, now);
const saved = await run(
  () => client.from("feeds").update({ ...closed, ended_at: endedAt }).eq("id", open.id),
  () =>
    breastSavedNotice({
      side: open.side ?? "both",
      startedAtIso: open.started_at,
      endedAtIso: endedAt,
      minutes: activeMinutes({ ...open, ...closed, ended_at: endedAt }, now),
      updated: false,
      timeZone,
    }),
);

// saveFeed — updated = Boolean(feedId); use start/end ISO from locals; minutes from activeMinutes on synthetic feed or (end-start)/60000 when no pause
// saveBottle — bottleSavedNotice(ml, iso, timeZone, Boolean(feedId))
// logDiaper — diaperSavedNotice(kind, new Date().toISOString(), timeZone, false)
// savePastDiaper — diaperSavedNotice(kind, zonedTimeToUtc(local, timeZone).toISOString(), timeZone, false)
// saveDiaper — diaperSavedNotice(kind, zonedTimeToUtc(local, timeZone).toISOString(), timeZone, true)
```

Leave `pauseFeed`, `resumeFeed`, group/ungroup/dismiss, `removeFeed`, `removeDiaper` as `run(() => ...)` with **no** second argument.

For `saveFeed` minutes when `end` is set and there is no pause data on insert, use:

```ts
const minutes = end ? (end.getTime() - start.getTime()) / 60_000 : null;
```

For edit of an existing feed that may have `paused_ms`, prefer reading the editing feed if available (`editing`) and `activeMinutes({ ...editing, started_at, ended_at, ... })`, else the simple delta above.

- [ ] **Step 3: Render the dialog**

Inside the root of `TodayPanel`’s return (e.g. first child of the outer fragment/div):

```tsx
{success ? <SuccessDialog notice={success} onClose={() => setSuccess(null)} /> : null}
```

- [ ] **Step 4: Run unit tests + typecheck**

Run: `npm test -- src/lib/successCopy.test.ts && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 5: Manual check on Hoy**

1. Log a quick diaper → modal “Pañal guardado” + tipo + hora → Listo closes it.
2. Save a past breast feed → “Toma guardada” with side, span, minutes.
3. Pause a running feed → **no** modal.
4. Force an invalid bottle ml → error text, **no** modal.

- [ ] **Step 6: Commit**

```bash
git add src/screens/TodayPanel.tsx
git commit -m "$(cat <<'EOF'
Show a success dialog after feed and diaper saves on Hoy.

EOF
)"
```

---

## Spec coverage check

| Spec item | Task |
| --- | --- |
| Modal + Listo only | Task 2 |
| Rich Spanish detail | Task 1 |
| `run` optional success / lazy thunk | Task 3 |
| Listed with/without success call sites | Task 3 |
| No History / migrations / analytics changes | Out of plan steps |
| Unit tests for copy | Task 1 |

## Placeholder scan

No TBD/TODO left in tasks; call-site snippets name concrete builders and titles.
