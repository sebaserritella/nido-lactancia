# Developmental tips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show read-only age-banded developmental surveillance tips for the selected baby on Ficha (current band only; hide when missing `born_on` or age &gt; 24 months).

**Architecture:** Pure client module maps `completedCalendarMonths(born_on, today)` → band id → static Spanish content. `DevelopmentSection` renders on Ficha next to Visits/Vaccines. No DB, no forms, no realtime.

**Tech Stack:** TypeScript/React, Vitest, existing `age.ts` + `es.ts` + Ficha card patterns.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-developmental-tips-design.md`
- Spanish UI chrome via `es.ts`; band body bullets in `src/lib/developmentTips.ts`
- Only current age band; no “ver todas”
- Hide section if no `born_on` or completed months ≥ 25
- Educational surveillance only — calm tone, shared disclaimer, no vaccine claims, no diagnosis UI
- No migration / no `check:live-schema` impact
- Work on a feature branch off `main` (do not land multi-commit noise on `main` mid-implementation)

## File map

- Create: `src/lib/developmentTips.ts`
- Create: `src/lib/developmentTips.test.ts`
- Create: `src/screens/DevelopmentSection.tsx`
- Modify: `src/i18n/es.ts`
- Modify: `src/screens/FichaPanel.tsx`

---

### Task 1: Band mapping + content module (TDD)

**Files:**
- Create: `src/lib/developmentTips.ts`
- Create: `src/lib/developmentTips.test.ts`

**Interfaces:**
- Produces:
  - `export type DevelopmentBandId = "m0_3" | "m4_6" | "m9" | "m12" | "m18" | "m24"`
  - `export type DevelopmentBandContent = { id: DevelopmentBandId; title: string; expected: string[]; consultIf: string[]; tips: string[] }`
  - `export function developmentBandForMonths(months: number): DevelopmentBandId | null`
  - `export function developmentTipsForBaby(bornOn: string | null, today: string): DevelopmentBandContent | null`
- Consumes: `completedCalendarMonths` from `./age`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { developmentBandForMonths, developmentTipsForBaby } from "./developmentTips";

describe("developmentBandForMonths", () => {
  it.each([
    [0, "m0_3"],
    [3, "m0_3"],
    [4, "m4_6"],
    [6, "m4_6"],
    [7, "m9"],
    [10, "m9"],
    [11, "m12"],
    [14, "m12"],
    [15, "m18"],
    [20, "m18"],
    [21, "m24"],
    [24, "m24"],
  ] as const)("maps %i months to %s", (months, band) => {
    expect(developmentBandForMonths(months)).toBe(band);
  });

  it("returns null at 25+ months", () => {
    expect(developmentBandForMonths(25)).toBeNull();
    expect(developmentBandForMonths(36)).toBeNull();
  });

  it("returns null for negative months", () => {
    expect(developmentBandForMonths(-1)).toBeNull();
  });
});

describe("developmentTipsForBaby", () => {
  it("returns null when bornOn is null", () => {
    expect(developmentTipsForBaby(null, "2026-10-20")).toBeNull();
  });

  it("returns null when baby is older than 24 months", () => {
    expect(developmentTipsForBaby("2023-01-01", "2026-10-20")).toBeNull();
  });

  it("returns the 9-month band content for a ~9 month old", () => {
    const tip = developmentTipsForBaby("2026-01-20", "2026-10-20");
    expect(tip?.id).toBe("m9");
    expect(tip?.title).toBe("Alrededor de 9 meses");
    expect(tip?.expected.length).toBeGreaterThan(0);
    expect(tip?.consultIf.length).toBeGreaterThan(0);
    expect(tip?.tips.length).toBeGreaterThan(0);
  });

  it("returns null when bornOn is invalid", () => {
    expect(developmentTipsForBaby("not-a-date", "2026-10-20")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/developmentTips.test.ts`

Expected: FAIL (module / exports missing)

- [ ] **Step 3: Implement `developmentTips.ts`**

```ts
import { completedCalendarMonths } from "./age";

export type DevelopmentBandId = "m0_3" | "m4_6" | "m9" | "m12" | "m18" | "m24";

export type DevelopmentBandContent = {
  id: DevelopmentBandId;
  title: string;
  expected: string[];
  consultIf: string[];
  tips: string[];
};

const bands: Record<DevelopmentBandId, Omit<DevelopmentBandContent, "id">> = {
  m0_3: {
    title: "0 a 3 meses",
    expected: [
      "Te mira un rato y sigue caras o luces",
      "Se calma con voz o brazos",
      "Sonrisa social hacia las 6–8 semanas",
      "Lleva las manos a la boca; sostiene un momento la cabeza boca abajo",
    ],
    consultIf: [
      "Casi no responde a sonidos fuertes",
      "No fija la mirada",
      "Tono muy flácido o muy rígido",
      "No sonríe a nadie hacia los 3 meses",
    ],
    tips: [
      "¿Te mira cuando le hablás de cerca?",
      "¿Se calma un poco con tu voz o el colo?",
      "¿Hay sonrisa social con personas conocidas?",
    ],
  },
  m4_6: {
    title: "4 a 6 meses",
    expected: [
      "Ríe a carcajadas y busca quién habla",
      "Balbucea",
      "Gira, se sienta con apoyo, pasa objetos de una mano a otra",
      "Reconoce caras conocidas",
    ],
    consultIf: [
      "No balbucea",
      "No muestra interés por las personas",
      "No alcanza objetos",
      "No gira la cabeza al oír su nombre hacia el final de esta etapa",
    ],
    tips: [
      "¿Busca la voz cuando alguien habla?",
      "¿Quiere agarrar lo que le mostrás?",
      "¿Hay juego de risas ida y vuelta?",
    ],
  },
  m9: {
    title: "Alrededor de 9 meses",
    expected: [
      "Gatea o se desplaza; se sienta solo",
      "Empieza la pinza con los dedos",
      "Juego de esconder / aparecer; entiende un “no” básico",
      "Sílabas tipo ba / ma / da; puede haber ansiedad ante desconocidos",
    ],
    consultIf: [
      "No responde al nombre",
      "No busca interacción",
      "No señala ni mira a lo que le mostrás",
      "No balbucea con variedad",
    ],
    tips: [
      "¿Responde cuando lo llamás por su nombre?",
      "¿Te mira para compartir algo interesante?",
      "¿Imita gestos simples (aplauso, chau)?",
    ],
  },
  m12: {
    title: "Alrededor de 12 meses",
    expected: [
      "Camina con apoyo o primeros pasos",
      "1–2 palabras con sentido (mamá / papá / agua)",
      "Señala lo que quiere",
      "Imita gestos; juega a dar y recibir",
    ],
    consultIf: [
      "No señala",
      "No dice ninguna palabra",
      "No imita",
      "No hay juego compartido; evita mucho el contacto visual",
      "Movimientos repetitivos muy rígidos que cortan el juego",
    ],
    tips: [
      "¿Te señala o te trae algo para que lo veas?",
      "¿Usa alguna palabra con sentido?",
      "¿Le importa tu reacción (risa, sorpresa)?",
    ],
  },
  m18: {
    title: "Alrededor de 18 meses",
    expected: [
      "Camina seguro; sube escalones con ayuda",
      "Unas 10–20 palabras; señala partes del cuerpo",
      "Juego de fingir simple (dar de comer a un muñeco)",
      "Trae cosas para mostrar",
    ],
    consultIf: [
      "Menos de ~5–10 palabras",
      "No señala",
      "Poco interés en otros niños o adultos",
      "No hay juego simbólico",
      "Regresión: dejó de hablar o de mirar",
    ],
    tips: [
      "¿Te muestra objetos para compartir, no solo para pedir?",
      "¿Hay juego de fingir aunque sea mínimo?",
      "¿El lenguaje sirve para comunicar (no solo repetir)?",
    ],
  },
  m24: {
    title: "Alrededor de 24 meses",
    expected: [
      "Corre; puede patear una pelota; sube y baja con apoyo",
      "Frases de 2 palabras; sigue órdenes simples de 2 pasos",
      "Juego paralelo con otros niños; más juego de fingir",
    ],
    consultIf: [
      "No junta palabras",
      "No entiende órdenes simples",
      "No hay juego compartido",
      "Rutinas muy fijas con mucha angustia si se cambian",
      "Estereotipias intensas",
    ],
    tips: [
      "¿Junta dos palabras con sentido?",
      "¿Sigue una orden simple de dos pasos?",
      "¿Hay ida y vuelta en el juego o la conversación?",
    ],
  },
};

export function developmentBandForMonths(months: number): DevelopmentBandId | null {
  if (!Number.isFinite(months) || months < 0) return null;
  if (months <= 3) return "m0_3";
  if (months <= 6) return "m4_6";
  if (months <= 10) return "m9";
  if (months <= 14) return "m12";
  if (months <= 20) return "m18";
  if (months <= 24) return "m24";
  return null;
}

export function developmentTipsForBaby(
  bornOn: string | null,
  today: string,
): DevelopmentBandContent | null {
  if (!bornOn) return null;
  const months = completedCalendarMonths(bornOn, today);
  if (months === null) return null;
  const id = developmentBandForMonths(months);
  if (!id) return null;
  const body = bands[id];
  return { id, ...body };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/developmentTips.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/developmental-tips
git add src/lib/developmentTips.ts src/lib/developmentTips.test.ts
git commit -m "$(cat <<'EOF'
Add age-band mapping and static developmental tip content.

EOF
)"
```

---

### Task 2: i18n chrome + DevelopmentSection UI

**Files:**
- Modify: `src/i18n/es.ts` (add keys after `visits` block, before closing `};`)
- Create: `src/screens/DevelopmentSection.tsx`

**Interfaces:**
- Consumes: `developmentTipsForBaby` from `../lib/developmentTips`; `todayLocalDate` from `../lib/localTime`; `es` chrome keys
- Produces: `DevelopmentSection({ baby, timeZone })` — returns `null` when no tip

- [ ] **Step 1: Add Spanish chrome strings to `es.ts`**

Add inside the `es` object:

```ts
  development: "Desarrollo",
  developmentExpected: "Esperable",
  developmentConsultIf: "Consultar si…",
  developmentTipsHeading: "Qué mirar",
  developmentDisclaimer:
    "Orientación general, no diagnostica. Una señal aislada no define nada: importa el patrón y si pierde habilidades que ya tenía. Ante dudas, hablá con el pediatra.",
```

- [ ] **Step 2: Create `DevelopmentSection.tsx`**

```tsx
import type { Baby } from "../domain";
import { es } from "../i18n/es";
import { developmentTipsForBaby } from "../lib/developmentTips";
import { todayLocalDate } from "../lib/localTime";

type DevelopmentSectionProps = {
  baby: Baby;
  timeZone: string;
};

export function DevelopmentSection({ baby, timeZone }: DevelopmentSectionProps) {
  const tip = developmentTipsForBaby(baby.born_on, todayLocalDate(timeZone));
  if (!tip) return null;

  return (
    <section className="card stack development">
      <h2>
        {es.development} · {baby.name}
      </h2>
      <p className="muted">{tip.title}</p>
      <div className="stack">
        <h3 className="vaccine-stage-title">{es.developmentExpected}</h3>
        <ul className="entries plain">
          {tip.expected.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="stack">
        <h3 className="vaccine-stage-title">{es.developmentConsultIf}</h3>
        <ul className="entries plain">
          {tip.consultIf.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="stack">
        <h3 className="vaccine-stage-title">{es.developmentTipsHeading}</h3>
        <ul className="entries plain">
          {tip.tips.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <p className="muted">{es.developmentDisclaimer}</p>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck / unit tests still pass**

Run: `npx vitest run src/lib/developmentTips.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es.ts src/screens/DevelopmentSection.tsx
git commit -m "$(cat <<'EOF'
Add Desarrollo section UI with shared disclaimer chrome.

EOF
)"
```

---

### Task 3: Wire into FichaPanel

**Files:**
- Modify: `src/screens/FichaPanel.tsx`

**Interfaces:**
- Consumes: `DevelopmentSection`
- Produces: section rendered when `selected` is set (component self-hides if no band)

- [ ] **Step 1: Import and render**

Add import:

```tsx
import { DevelopmentSection } from "./DevelopmentSection";
```

After the Visits / Vaccines blocks (order: profile → Visits → Vaccines → Desarrollo), add:

```tsx
      {selected ? <DevelopmentSection baby={selected} timeZone={timeZone} /> : null}
```

Exact placement — append after Vaccines so medical-log sections stay together and tips sit last:

```tsx
      {selected ? (
        <VisitsSection client={client} baby={selected} userId={userId} timeZone={timeZone} />
      ) : null}
      {selected ? <VaccinesSection client={client} baby={selected} userId={userId} timeZone={timeZone} /> : null}
      {selected ? <DevelopmentSection baby={selected} timeZone={timeZone} /> : null}
```

- [ ] **Step 2: Run full unit suite (lib)**

Run: `npx vitest run src/lib/developmentTips.test.ts src/lib/age.ts`  
(or `npx vitest run src/lib`)

Expected: developmentTips tests PASS; no regressions required beyond existing suite if run fully: `npx vitest run`

- [ ] **Step 3: Manual smoke**

- Baby with `born_on` ~9 months → Ficha shows **Desarrollo** with “Alrededor de 9 meses”
- Baby without `born_on` → section absent
- Baby &gt; 24 months → section absent

- [ ] **Step 4: Commit**

```bash
git add src/screens/FichaPanel.tsx
git commit -m "$(cat <<'EOF'
Show age-banded developmental tips on Ficha.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Ficha section, current band only | 2, 3 |
| Hide if no `born_on` or &gt; 24 months | 1, 2 |
| Band table + `completedCalendarMonths` | 1 |
| Esperable / Consultar si / Qué mirar + disclaimer | 1, 2 |
| Chrome in `es.ts`, bodies in module | 1, 2 |
| No DB / no forms | all |
| Unit tests on boundaries | 1 |

## Self-review notes

- No placeholders; band content inlined in Task 1.
- `developmentTipsForBaby("2026-01-20", "2026-10-20")` → 9 completed months → `m9` (aligned with `completedCalendarMonths`).
- Order on Ficha: Visits → Vaccines → Desarrollo (explicit).
