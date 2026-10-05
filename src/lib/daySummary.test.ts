import { describe, expect, it } from "vitest";
import { sideMinutesPerDay, summarizeDay } from "./daySummary";

describe("summarizeDay", () => {
  it("counts every feed and diaper, and skips minutes while a feed is open", () => {
    const summary = summarizeDay(
      [
        { started_at: "2026-10-05T13:00:00Z", ended_at: "2026-10-05T13:18:00Z", paused_ms: 0, side: "left" as const },
        { started_at: "2026-10-05T16:00:00Z", ended_at: null, paused_ms: 0, side: "both" as const },
      ],
      [{ kind: "pee" }, { kind: "both" }],
    );
    expect(summary).toEqual({
      feedCount: 2,
      minutes: 18,
      leftMinutes: 18,
      rightMinutes: 0,
      meanGapMinutes: 180,
      diaperChanges: 2,
      pee: 2,
      poop: 1,
    });
  });

  it("subtracts a pause from the day's minutes", () => {
    const summary = summarizeDay(
      [{ started_at: "2026-10-05T13:00:00Z", ended_at: "2026-10-05T13:20:00Z", paused_ms: 5 * 60 * 1000, side: "both" as const }],
      [],
    );
    expect(summary.minutes).toBe(15);
    expect(summary.leftMinutes).toBe(15);
    expect(summary.rightMinutes).toBe(15);
    expect(summary.meanGapMinutes).toBeNull();
  });

  it("averages each breast over days that had a completed feed", () => {
    const perDay = sideMinutesPerDay(
      [
        { started_at: "2026-10-01T13:00:00Z", ended_at: "2026-10-01T13:18:00Z", side: "left" },
        { started_at: "2026-10-02T13:00:00Z", ended_at: "2026-10-02T13:20:00Z", side: "both" },
        { started_at: "2026-10-02T16:00:00Z", ended_at: null, side: "right" },
      ],
      "America/Argentina/Buenos_Aires",
    );
    expect(perDay.left).toBeCloseTo(19);
    expect(perDay.right).toBeCloseTo(10);
  });
});
