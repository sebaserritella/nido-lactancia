# Finish latent Option A — design

## Goal

Ship the three unfinished pieces already half-built in Nido: **period averages in Historial**, **household join/invite by code**, and a **minimal installable PWA**. Keep the product identity: a calm Spanish couple tracker for feeds and diapers—no new domains (sleep, pumping, export).

## Delivery approach

**Sequenced (three slices / PRs), same design:**

1. Historial period stats UI  
2. Invite / join by code  
3. Minimal PWA  

Each slice must be shippable alone. No single mega-PR.

## Non-goals (this initiative)

- Sleep, pumping, meds, growth percentiles, pediatra PDF/CSV export  
- Push notifications or offline Supabase sync  
- Short / human-friendly invite codes (keep existing hex RPC)  
- QR codes, deep links, or invite expiry UI beyond what the RPC already encodes  
- Fancy charts; new design system  
- Replacing email invite (`invite_by_email`)  
- Changing `range_stats` RPC or inventing new migrations for slices 1–2  

---

## Slice 1 — Historial period averages

### Goal

Let caregivers switch **Día / Semana / Mes**, navigate the range, and see feed minutes and diaper averages using existing `summarizePeriod` / `shiftRange`.

### Placement

| Surface | Behavior |
|---------|----------|
| **Historial** | New card/section **Por período** (or reuse `es` grain labels) near the existing lifetime `range_stats` card |
| Lifetime stats | Keep as-is (birth → today) |
| Day picker / WeekTimeline / day detail | Unchanged |

### Behavior

- Grain toggle: `day` \| `week` \| `month` (default: `week`)  
- Range: inclusive local dates; **Anterior / Siguiente** via `shiftRange(from, to, ±1)`  
- Initial range: for `week`, current Mon–Sun containing today (aligned with `periodStats` week keys); for `day`, today–today; for `month`, first–last day of current month (clamped so `from >= baby.born_on` when set, `to <= today`)  
- Compute client-side with feeds/diapers already loaded for Historial (same query window birth→today). No new RPC.  
- Display using existing `Stat` pattern:  
  - Minutes per period (`minutesPerDay` / `Week` / `Month` from `es`)  
  - Diapers per period  
  - Side portions (izq/der) and diaper portions (pis/caca) when non-empty  
- Show `es.periodNote`  
- Open (in-progress) feeds do not add minutes (`summarizePeriod` already filters `ended_at !== null`)

### Out of scope (slice 1)

- Bucket bar charts  
- Weight/length in the period  
- Editing feeds from this section  
- Persisting grain preference  

### Acceptance

- Changing grain and shifting range updates numbers consistently with `periodStats` semantics  
- Empty range shows clear empty/muted state (reuse `es.emptyRange` / `es.noData` as appropriate)  
- Existing lifetime card and day drill-down still work  
- Unit tests for any new range-init helpers; existing `periodStats.test.ts` remains green  

### Files (expected)

- `src/screens/HistoryPanel.tsx` (and small helper if range init is non-trivial)  
- `src/i18n/es.ts` only if a missing string is needed (most grain strings already exist)  
- Tests under `src/lib/` or panel-adjacent as fits repo patterns  

---

## Slice 2 — Invite / join by code

### Goal

Surface existing RPCs `create_invite` and `join_household` so a second caregiver can join without knowing the owner’s email invite path.

### Placement

| Surface | Who | Behavior |
|---------|-----|----------|
| **FamilyPanel** | Household member (any member can call `create_invite` today) | Block **Código**: generate, show code, copy to clipboard |
| **FamilyScreen** | Authenticated user with **no** household | Field + submit **Tengo un código** → `join_household` → `onReady()` |
| Email invite | Owner | Unchanged |

### Behavior

- **Generate:** `rpc('create_invite')` → display returned hex string; optional “Copiar” using `navigator.clipboard` with fallback select/copy if needed  
- **Expiry:** 7 days per RPC; no custom expiry UI. Copy can mention “válido 7 días” in help text  
- **Join:** trim code; `rpc('join_household', { p_code })`; on success enter tracker; map errors via existing `messageForError` (`invalid invite`, `already in a household`)  
- **Local mode:** `localClient` already implements both RPCs—UI must work offline/demo the same way  
- Analytics: track attempt success/failure for generate and join (mirror `caregiver_invited` style; new event names ok if consistent)

### Out of scope (slice 2)

- Migrating to shorter codes  
- Listing active code invites in `list_household_people`  
- Redeeming while already in a household  
- Changing who may `create_invite` (keep RPC as deployed)

### Acceptance

- User A generates code; user B (signed in, no household) joins and sees shared babies  
- Invalid / expired / used code shows existing Spanish error  
- Email invite flow still works  
- `localClient` tests for join remain green; add UI-facing coverage if the repo has panel tests, otherwise manual + RPC tests  

### Files (expected)

- `src/screens/FamilyPanel.tsx`  
- `src/screens/FamilyScreen.tsx`  
- `src/i18n/es.ts`  
- Possibly `src/lib/analytics.ts` event names  
- No new migration if RPCs already live on the project  

---

## Slice 3 — Minimal PWA

### Goal

Make “Agregar a inicio” feel like an app: name, theme, icons, and a tiny service worker that caches the app shell only.

### Behavior

- `manifest.webmanifest`: `name` / `short_name` “Nido lactancia”, `lang: es`, `display: standalone`, `start_url` compatible with Vite `base: "./"` (e.g. `./`), `theme_color` / `background_color` aligned with `#f3ecdf`  
- Icons: at least 192 and 512 PNG (generate simple brand-consistent assets under `public/`)  
- `index.html`: link rel manifest, apple-touch-icon, keep existing viewport / theme-color  
- Service worker: precache built assets (HTML/JS/CSS); **network-first or bypass** for Supabase/API; no offline write queue  
- Prefer the smallest Vite-compatible approach (vite-plugin-pwa **or** hand-rolled SW registered from `main.tsx`)—choose one in the implementation plan, not both  

### Out of scope (slice 3)

- Offline logging  
- Push  
- Custom iOS install interstitial beyond correct icons/name  
- Changing Instagram docs except a one-line note if install steps improve  

### Acceptance

- `npm run build` succeeds; preview/install criteria: Android Chrome offers install; iOS Safari add-to-home uses correct name/icon  
- App still loads on GitHub Pages with correct base URL  
- Existing tests unaffected  

### Files (expected)

- `index.html`, `public/manifest.webmanifest`, `public/icons/*`  
- `vite.config` / SW registration entry  
- Possibly `package.json` if a plugin is added  

---

## Permissions & data

| Slice | Auth / DB |
|-------|-----------|
| 1 | Same Historial access; client-only stats |
| 2 | Authenticated; existing security definer RPCs; no schema change planned |
| 3 | Static assets only |

If live project already has `create_invite` / `join_household` from early migrations, slice 2 needs **no** `check:live-schema` column add. Confirm during implementation; do not invent a migration “just in case.”

## Errors

Reuse `messageForError`. Clipboard failure: show code for manual copy, no crash. PWA SW registration failure: app works as normal web page.

## Testing summary

| Slice | Automated | Manual |
|-------|-----------|--------|
| 1 | periodStats + range-init helpers | Grain switch, shift, open feed excluded |
| 2 | localClient join/create; error mapping | Two-browser join |
| 3 | build | Install on phone |

## Out of scope follow-ups

- Charts for period buckets  
- Short codes / QR  
- Full offline PWA  
- Wiring Instagram Phase 2 to install prompt
