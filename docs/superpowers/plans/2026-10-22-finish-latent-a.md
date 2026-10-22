# Finish latent Option A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Historial period averages, invite/join-by-code UI, and a minimal installable PWA as three sequenced, independently shippable slices.

**Architecture:** Reuse existing `periodStats` (client-side over Historial feeds/diapers), existing `create_invite` / `join_household` RPCs + `localClient` mocks, and add a Vite PWA shell (manifest + icons + generateSW) without offline data sync. No new Supabase migrations.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Supabase JS, `vite-plugin-pwa` (slice 3 only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-22-finish-latent-a-design.md`
- Spanish UI only via `src/i18n/es.ts`
- Work on a feature branch off `main`; land each slice as its own squashable commit series / PR when possible
- No sleep / pumping / export / push / short codes / charts
- No new DB migrations unless live RPCs are proven missing (confirm; do not invent)
- TDD for new pure helpers; keep `npm test` green after every task
- YAGNI: reuse `Stat` / card / muted patterns; no new design system

## File map

| Slice | Create | Modify |
|-------|--------|--------|
| 1 | — | `src/lib/periodStats.ts`, `src/lib/periodStats.test.ts`, `src/screens/HistoryPanel.tsx`, `src/i18n/es.ts` (only if needed) |
| 2 | — | `src/screens/FamilyPanel.tsx`, `src/screens/FamilyScreen.tsx`, `src/i18n/es.ts`, `src/lib/analytics.ts`, `src/lib/analytics.test.ts` |
| 3 | `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png` | `index.html`, `vite.config.ts`, `package.json`, `src/main.tsx` (registration if required by plugin) |

---

## Slice 1 — Historial period averages

### Task 1: Period range helpers (TDD)

**Files:**
- Modify: `src/lib/periodStats.ts`
- Modify: `src/lib/periodStats.test.ts`

**Interfaces:**
- Consumes: existing `StatGrain`, `addCalendarDays` from `./localTime` (import it), private week-Monday logic already used by `periodKey`
- Produces:
  - `export function initialPeriodRange(grain: StatGrain, today: string, bornOn: string | null): { from: string; to: string }`
  - `export function clampPeriodRange(from: string, to: string, bornOn: string | null, today: string): { from: string; to: string }`
  - `export function canShiftPeriod(from: string, to: string, direction: -1 | 1, bornOn: string | null, today: string): boolean`

- [ ] **Step 1: Write the failing tests** (append to `periodStats.test.ts`)

```ts
import { canShiftPeriod, clampPeriodRange, initialPeriodRange, shiftRange } from "./periodStats";

describe("initialPeriodRange", () => {
  it("returns today for day grain", () => {
    expect(initialPeriodRange("day", "2026-10-22", "2026-01-01")).toEqual({
      from: "2026-10-22",
      to: "2026-10-22",
    });
  });

  it("returns Mon–Sun containing today for week grain", () => {
    // 2026-10-22 is Thursday → week Mon 19 – Sun 25
    expect(initialPeriodRange("week", "2026-10-22", "2026-01-01")).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
    });
  });

  it("returns calendar month for month grain", () => {
    expect(initialPeriodRange("month", "2026-10-22", "2026-01-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("clamps from to bornOn when the natural range starts earlier", () => {
    expect(initialPeriodRange("month", "2026-10-22", "2026-10-15")).toEqual({
      from: "2026-10-15",
      to: "2026-10-31",
    });
  });

  it("does not use bornOn when null", () => {
    expect(initialPeriodRange("week", "2026-10-22", null).from).toBe("2026-10-19");
  });
});

describe("clampPeriodRange", () => {
  it("caps to at today", () => {
    expect(clampPeriodRange("2026-10-19", "2026-10-25", "2026-01-01", "2026-10-22")).toEqual({
      from: "2026-10-19",
      to: "2026-10-22",
    });
  });
});

describe("canShiftPeriod", () => {
  it("blocks next when shifted window would start after today", () => {
    expect(canShiftPeriod("2026-10-19", "2026-10-22", 1, "2026-01-01", "2026-10-22")).toBe(false);
  });

  it("allows previous when shifted window still overlaps bornOn…today", () => {
    expect(canShiftPeriod("2026-10-19", "2026-10-22", -1, "2026-01-01", "2026-10-22")).toBe(true);
  });

  it("blocks previous when shifted window would end before bornOn", () => {
    expect(canShiftPeriod("2026-10-15", "2026-10-22", -1, "2026-10-15", "2026-10-22")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/periodStats.test.ts`

Expected: FAIL — `initialPeriodRange` / `canShiftPeriod` / `clampPeriodRange` not exported

- [ ] **Step 3: Implement helpers in `periodStats.ts`**

Export `clampPeriodRange`, `initialPeriodRange`, `canShiftPeriod`. Reuse the same Monday-week rule as existing `periodKey` (extract a shared `weekStartMonday(localDate: string): string` used by both `periodKey` and `initialPeriodRange` so week keys stay aligned).

```ts
import { addCalendarDays } from "./localTime";

export function clampPeriodRange(
  from: string,
  to: string,
  bornOn: string | null,
  today: string,
): { from: string; to: string } {
  let start = from;
  let end = to;
  if (end > today) end = today;
  if (bornOn && start < bornOn) start = bornOn;
  if (start > end) start = end;
  return { from: start, to: end };
}

export function initialPeriodRange(
  grain: StatGrain,
  today: string,
  bornOn: string | null,
): { from: string; to: string } {
  let from: string;
  let to: string;
  if (grain === "day") {
    from = today;
    to = today;
  } else if (grain === "week") {
    from = weekStartMonday(today);
    to = addCalendarDays(from, 6);
  } else {
    from = `${today.slice(0, 7)}-01`;
    const [year, month] = today.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    to = `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  }
  return clampPeriodRange(from, to, bornOn, today);
}

export function canShiftPeriod(
  from: string,
  to: string,
  direction: -1 | 1,
  bornOn: string | null,
  today: string,
): boolean {
  const shifted = shiftRange(from, to, direction);
  const clamped = clampPeriodRange(shifted.from, shifted.to, bornOn, today);
  if (direction === 1 && shifted.from > today) return false;
  if (direction === -1 && bornOn && shifted.to < bornOn) return false;
  // Reject no-ops where clamp collapses the window away from the shift intent
  if (clamped.from === from && clamped.to === to && (shifted.from !== from || shifted.to !== to)) {
    return false;
  }
  return clamped.from <= clamped.to;
}
```

Refactor `periodKey` for `grain === "week"` to call `weekStartMonday(localDate)` (same UTC Monday math already in file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/periodStats.test.ts`

Expected: PASS (adjust `canShiftPeriod` edge cases if a test expectation fights the clamp helper—prefer fixing the helper to match the test intent above)

- [ ] **Step 5: Commit**

```bash
git add src/lib/periodStats.ts src/lib/periodStats.test.ts
git commit -m "$(cat <<'EOF'
Add period range helpers for Historial day/week/month views.

EOF
)"
```

---

### Task 2: Wire period stats card into HistoryPanel

**Files:**
- Modify: `src/screens/HistoryPanel.tsx`
- Modify: `src/i18n/es.ts` (add `periodSection` if missing — suggested: `periodSection: "Por período"`)

**Interfaces:**
- Consumes: `summarizePeriod`, `shiftRange`, `initialPeriodRange`, `canShiftPeriod`, `clampPeriodRange`, `StatGrain` from `../lib/periodStats`; `formatMinutes`, `formatStat` from `../lib/format`; `es.grain*`, `es.minutesPer*`, `es.diapersPer*`, `es.periodNote`, `es.left`, `es.right`, `es.pee`, `es.poop`, `es.previousPeriod`, `es.nextPeriod`, `es.emptyRange`, `es.noData`

- [ ] **Step 1: Add i18n string**

In `src/i18n/es.ts`, near the grain keys:

```ts
periodSection: "Por período",
```

- [ ] **Step 2: Add state + derived stats in `HistoryPanel`**

After existing state hooks:

```ts
import {
  canShiftPeriod,
  clampPeriodRange,
  initialPeriodRange,
  shiftRange,
  summarizePeriod,
  type StatGrain,
} from "../lib/periodStats";

const [grain, setGrain] = useState<StatGrain>("week");
const [periodFrom, setPeriodFrom] = useState(() => initialPeriodRange("week", today, baby.born_on).from);
const [periodTo, setPeriodTo] = useState(() => initialPeriodRange("week", today, baby.born_on).to);

useEffect(() => {
  const next = initialPeriodRange(grain, today, baby.born_on);
  setPeriodFrom(next.from);
  setPeriodTo(next.to);
}, [grain, baby.id, baby.born_on, today]);

const periodStats = summarizePeriod(feeds, diapers, baby.id, periodFrom, periodTo, timeZone, grain);

const minutesLabel =
  grain === "day" ? es.minutesPerDay : grain === "week" ? es.minutesPerWeek : es.minutesPerMonth;
const diapersLabel =
  grain === "day" ? es.diapersPerDay : grain === "week" ? es.diapersPerWeek : es.diapersPerMonth;

function changeGrain(next: StatGrain) {
  setGrain(next);
}

function shift(direction: -1 | 1) {
  if (!canShiftPeriod(periodFrom, periodTo, direction, baby.born_on, today)) return;
  const shifted = shiftRange(periodFrom, periodTo, direction);
  const clamped = clampPeriodRange(shifted.from, shifted.to, baby.born_on, today);
  setPeriodFrom(clamped.from);
  setPeriodTo(clamped.to);
}
```

- [ ] **Step 3: Render the period card** (place **above** the lifetime `stats` card)

```tsx
<section className="card stack">
  <h2>{es.periodSection}</h2>
  <div className="row-actions" role="group" aria-label={es.grain}>
    {(["day", "week", "month"] as const).map((value) => (
      <button
        key={value}
        type="button"
        className={grain === value ? undefined : "ghost"}
        aria-pressed={grain === value}
        onClick={() => changeGrain(value)}
      >
        {value === "day" ? es.grainDay : value === "week" ? es.grainWeek : es.grainMonth}
      </button>
    ))}
  </div>
  <div className="day-picker">
    <button
      type="button"
      className="ghost"
      aria-label={es.previousPeriod}
      disabled={!canShiftPeriod(periodFrom, periodTo, -1, baby.born_on, today)}
      onClick={() => shift(-1)}
    >
      ‹
    </button>
    <p className="muted">
      {periodFrom === periodTo ? periodFrom : `${periodFrom} → ${periodTo}`}
    </p>
    <button
      type="button"
      className="ghost"
      aria-label={es.nextPeriod}
      disabled={!canShiftPeriod(periodFrom, periodTo, 1, baby.born_on, today)}
      onClick={() => shift(1)}
    >
      ›
    </button>
  </div>
  {periodStats.feedPeriodCount === 0 && periodStats.diaperPeriodCount === 0 ? (
    <p className="muted">{es.emptyRange}</p>
  ) : (
    <>
      <Stat label={minutesLabel} value={formatMinutes(periodStats.minutesPerPeriod)} />
      <Stat label={diapersLabel} value={formatStat(periodStats.diapersPerPeriod)} />
      {periodStats.sidePortions.map((portion) => (
        <Stat
          key={portion.key}
          label={portion.key === "left" ? es.left : es.right}
          value={formatMinutes(portion.perPeriod)}
        />
      ))}
      {periodStats.diaperPortions.map((portion) => (
        <Stat
          key={portion.key}
          label={portion.key === "pee" ? es.pee : es.poop}
          value={formatStat(portion.perPeriod)}
        />
      ))}
    </>
  )}
  <p className="muted">{es.periodNote}</p>
</section>
```

Keep the existing lifetime card, day picker, and timelines unchanged below.

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 5: Manual smoke**

Run: `npm run dev` → Historial → toggle Día/Semana/Mes → Anterior/Siguiente → confirm open feed does not inflate minutes.

- [ ] **Step 6: Commit (end of slice 1)**

```bash
git add src/screens/HistoryPanel.tsx src/i18n/es.ts src/lib/periodStats.ts src/lib/periodStats.test.ts
git commit -m "$(cat <<'EOF'
Show day/week/month averages on Historial.

EOF
)"
```

---

## Slice 2 — Invite / join by code

### Task 3: Analytics events for code invite/join

**Files:**
- Modify: `src/lib/analytics.ts`
- Modify: `src/lib/analytics.test.ts`

**Interfaces:**
- Produces schema entries: `invite_code_created`, `household_joined` (both `result: ok|error`), included in `actions` and `resultEvents`

- [ ] **Step 1: Extend analytics test**

```ts
it("keeps result for invite code and join events", () => {
  for (const name of ["invite_code_created", "household_joined"] as const) {
    expect(buildAnalyticsEvent(name, { result: "ok" })).toEqual({
      name,
      params: { result: "ok" },
    });
  }
  expect(
    buildAnalyticsEvent("save_failed", { action: "invite_code_created", reason: "unavailable" }),
  ).toEqual({
    name: "save_failed",
    params: { action: "invite_code_created", reason: "unavailable" },
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (unknown event / action)

Run: `npm test -- src/lib/analytics.test.ts`

- [ ] **Step 3: Register events in `analytics.ts`**

Add `"invite_code_created"` and `"household_joined"` to `actions`, `resultEvents`, and `schema` (same shape as `caregiver_invited`).

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts src/lib/analytics.test.ts
git commit -m "$(cat <<'EOF'
Track invite-code create and household join analytics.

EOF
)"
```

---

### Task 4: Generate + copy code in FamilyPanel

**Files:**
- Modify: `src/screens/FamilyPanel.tsx`
- Modify: `src/i18n/es.ts`

**Interfaces:**
- Consumes: `client.rpc("create_invite")` → `string` code; `trackAttempt("invite_code_created", …)`
- Produces: UI block visible to any household member (`people` loaded), not owner-only

- [ ] **Step 1: Add i18n strings**

```ts
inviteCodeTitle: "Código para unirse",
inviteCodeHelp: "Compartí este código. Vale 7 días o hasta que alguien lo use.",
inviteCodeGenerate: "Generar código",
inviteCodeCopy: "Copiar",
inviteCodeCopied: "Código copiado.",
```

- [ ] **Step 2: Implement generate + copy UI** in `FamilyPanel` (after members list, before email invite form)

State: `code: string | null`, `codeCopied: boolean`, reuse `busy` / `error`.

```ts
async function generateCode() {
  setBusy(true);
  setError(null);
  setCodeCopied(false);
  const { data, error: createError } = await client.rpc("create_invite");
  setBusy(false);
  if (createError || typeof data !== "string") {
    setError(messageForError(createError ?? { message: "" }));
    trackAttempt("invite_code_created", false, createError);
    return;
  }
  setCode(data);
  trackAttempt("invite_code_created", true);
}

async function copyCode() {
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
  } catch {
    setCodeCopied(false);
    // code stays visible for manual copy
  }
}
```

Render when `people` is non-null:

```tsx
<section className="stack">
  <h2>{es.inviteCodeTitle}</h2>
  <p className="muted">{es.inviteCodeHelp}</p>
  {code ? <p className="stat-line"><strong>{code}</strong></p> : null}
  <div className="row-actions">
    <button type="button" disabled={busy} onClick={() => void generateCode()}>
      {es.inviteCodeGenerate}
    </button>
    {code ? (
      <button type="button" className="ghost" disabled={busy} onClick={() => void copyCode()}>
        {es.inviteCodeCopy}
      </button>
    ) : null}
  </div>
  {codeCopied ? <p>{es.inviteCodeCopied}</p> : null}
</section>
```

Keep owner-only email invite form unchanged.

- [ ] **Step 3: Manual smoke in local mode** (`npm run dev` without Supabase env) — generate code, confirm string appears.

- [ ] **Step 4: Commit**

```bash
git add src/screens/FamilyPanel.tsx src/i18n/es.ts
git commit -m "$(cat <<'EOF'
Add household invite-code generate and copy in Familia.

EOF
)"
```

---

### Task 5: Join by code on FamilyScreen

**Files:**
- Modify: `src/screens/FamilyScreen.tsx`
- Modify: `src/i18n/es.ts`

**Interfaces:**
- Consumes: `client.rpc("join_household", { p_code: trimmed })`; `trackAttempt("household_joined", …)`; `messageForError`
- Produces: on success call existing `onReady()`

- [ ] **Step 1: Add i18n**

```ts
joinWithCode: "Tengo un código",
joinCodeLabel: "Código de la familia",
joinCodeSubmit: "Unirme",
```

- [ ] **Step 2: Extend `FamilyScreen`**

```tsx
const [code, setCode] = useState("");
// existing error/pending

async function joinWithCode(event: FormEvent) {
  event.preventDefault();
  setPending(true);
  setError(null);
  const { error: joinError } = await client.rpc("join_household", { p_code: code.trim() });
  setPending(false);
  if (joinError) {
    setError(messageForError(joinError));
    trackAttempt("household_joined", false, joinError);
    return;
  }
  trackAttempt("household_joined", true);
  onReady();
}
```

UI: keep create-family button; add form below with code input + submit. Disable submit when `code.trim() === ""` or `pending`.

- [ ] **Step 3: Run** `npm test -- src/lib/localClient.test.ts` — Expected: PASS (existing join test)

- [ ] **Step 4: Manual** — two local profiles if feasible, or one generate + second browser/profile join

- [ ] **Step 5: Commit (end of slice 2)**

```bash
git add src/screens/FamilyScreen.tsx src/i18n/es.ts src/screens/FamilyPanel.tsx src/lib/analytics.ts src/lib/analytics.test.ts
git commit -m "$(cat <<'EOF'
Let caregivers join a household with an invite code.

EOF
)"
```

---

## Slice 3 — Minimal PWA

### Task 6: Manifest + icons

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Modify: `index.html`

**Interfaces:**
- Produces static install metadata; `start_url: "./"` matching Vite `base: "./"`

- [ ] **Step 1: Write `public/manifest.webmanifest`**

```json
{
  "name": "Nido lactancia",
  "short_name": "Nido",
  "lang": "es",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#f3ecdf",
  "theme_color": "#f3ecdf",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 2: Create icons**

Prefer resizing `docs/instagram/avatar.png` if present and suitable; otherwise generate solid `#f3ecdf` PNGs with a simple centered mark (ImageMagick `convert`, or a one-off Node script). Output exactly:

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`

Do not commit Instagram marketing folders unrelated to these two files.

- [ ] **Step 3: Update `index.html` `<head>`**

```html
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="apple-touch-icon" href="./icons/icon-192.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Nido lactancia" />
```

Keep existing `theme-color` and viewport.

- [ ] **Step 4: Commit**

```bash
git add public/manifest.webmanifest public/icons/icon-192.png public/icons/icon-512.png index.html
git commit -m "$(cat <<'EOF'
Add web app manifest and home-screen icons.

EOF
)"
```

---

### Task 7: Service worker via vite-plugin-pwa

**Files:**
- Modify: `package.json` (add `vite-plugin-pwa` devDependency)
- Modify: `vite.config.ts`
- Modify: `src/main.tsx` only if the plugin requires a virtual module import — prefer `injectRegister: "auto"` so `main.tsx` stays unchanged when possible

**Interfaces:**
- Produces: build-time SW that precaches app shell; **do not** cache Supabase API (network-only for `supabase.co` / configured host)

- [ ] **Step 1: Install plugin**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Configure `vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "manifest.webmanifest"],
      manifest: false, // use public/manifest.webmanifest
      workbox: {
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.includes("supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  base: "./",
  test: {
    environment: "node",
  },
});
```

If the plugin version requires an explicit `strategies: "generateSW"`, set it. If `manifest: false` is unsupported, inline the same manifest fields instead of duplicating files—pick one source of truth and delete the unused path.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: SUCCESS; `dist/` contains SW assets (`sw.js` or equivalent)

- [ ] **Step 4: Preview smoke**

Run: `npm run preview` → open in Chrome → Application tab shows manifest + service worker. Confirm app still loads.

- [ ] **Step 5: Full tests**

Run: `npm test`

Expected: PASS (Vitest must not break on PWA plugin; if it does, gate the plugin with `!process.env.VITEST` or equivalent documented fix)

- [ ] **Step 6: Commit (end of slice 3)**

```bash
git add package.json package-lock.json vite.config.ts src/main.tsx public index.html
git commit -m "$(cat <<'EOF'
Enable minimal PWA shell caching with vite-plugin-pwa.

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Period grain + shift + summarizePeriod UI | Tasks 1–2 |
| Invite code generate/copy | Task 4 |
| Join on FamilyScreen | Task 5 |
| Analytics for code flows | Task 3 |
| Manifest + icons + theme | Task 6 |
| SW shell only, no offline DB | Task 7 |
| Sequenced shippable slices | Commits at end of Tasks 2, 5, 7 |
| No migrations / no short codes / no charts | Global constraints |

No TBD placeholders. Types for helpers match HistoryPanel wiring.
