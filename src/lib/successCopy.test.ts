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
