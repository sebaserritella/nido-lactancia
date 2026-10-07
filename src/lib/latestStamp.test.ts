import { describe, expect, it } from "vitest";
import { formatLatestFeedLine, formatLatestStamp } from "./latestStamp";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("latest stamp", () => {
  const now = new Date("2026-10-04T18:00:00.000Z");

  it("says minutes ago when under one hour", () => {
    expect(formatLatestStamp("2026-10-04T17:40:00.000Z", BUENOS_AIRES, now)).toBe("Hace 20 minutos");
    expect(formatLatestStamp("2026-10-04T17:59:00.000Z", BUENOS_AIRES, now)).toBe("Hace 1 minuto");
  });

  it("says hours and minutes when under 24 hours", () => {
    expect(formatLatestStamp("2026-10-04T15:20:00.000Z", BUENOS_AIRES, now)).toBe("Hace 2 horas y 40 minutos");
    expect(formatLatestStamp("2026-10-04T16:00:00.000Z", BUENOS_AIRES, now)).toBe("Hace 2 horas");
    expect(formatLatestStamp("2026-10-04T17:00:00.000Z", BUENOS_AIRES, now)).toBe("Hace 1 hora");
    expect(formatLatestStamp("2026-10-04T16:59:00.000Z", BUENOS_AIRES, now)).toBe("Hace 1 hora y 1 minuto");
  });

  it("says less than a minute for very recent events", () => {
    expect(formatLatestStamp("2026-10-04T17:59:30.000Z", BUENOS_AIRES, now)).toBe("Hace menos de 1 minuto");
  });

  it("falls back to a calendar stamp at 24 hours or more", () => {
    expect(formatLatestStamp("2026-10-03T18:00:00.000Z", BUENOS_AIRES, now)).toBe("ayer 15:00");
    expect(formatLatestStamp("2026-10-02T15:00:00.000Z", BUENOS_AIRES, now)).toBe("anteayer 12:00");
    expect(formatLatestStamp("2026-10-01T15:00:00.000Z", BUENOS_AIRES, now)).toBe("2026-10-01 12:00");
  });

  it("uses the end time for a finished feed and keeps duration minutes", () => {
    expect(formatLatestFeedLine("2026-10-04T15:32:00.000Z", "2026-10-04T15:50:00.000Z", BUENOS_AIRES, "En curso", now)).toBe(
      "Hace 2 horas y 10 minutos · 18 min",
    );
  });

  it("drops paused minutes from the finished line", () => {
    expect(
      formatLatestFeedLine("2026-10-04T15:32:00.000Z", "2026-10-04T15:50:00.000Z", BUENOS_AIRES, "En curso", now, 5 * 60_000),
    ).toBe("Hace 2 horas y 10 minutos · 13 min");
  });

  it("marks an open feed as in progress without a hace label", () => {
    expect(formatLatestFeedLine("2026-10-04T15:05:00.000Z", null, BUENOS_AIRES, "En curso", now)).toBe("En curso");
  });
});
