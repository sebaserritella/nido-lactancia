import { describe, expect, it } from "vitest";
import { computeRangeStats } from "./computeRangeStats";

const babyId = "22222222-2222-2222-2222-222222222222";

describe("computeRangeStats", () => {
  it("matches the household averages for a Buenos Aires range", () => {
    const stats = computeRangeStats(
      [
        { baby_id: babyId, started_at: "2026-10-01T03:10:00Z", ended_at: "2026-10-01T03:28:00Z" },
        { baby_id: babyId, started_at: "2026-10-01T06:00:00Z", ended_at: "2026-10-01T06:20:00Z" },
        { baby_id: babyId, started_at: "2026-10-02T04:00:00Z", ended_at: null },
        { baby_id: babyId, started_at: "2026-10-01T02:30:00Z", ended_at: "2026-10-01T02:40:00Z" },
      ],
      [
        { baby_id: babyId, occurred_at: "2026-10-01T15:00:00Z", kind: "pee" },
        { baby_id: babyId, occurred_at: "2026-10-02T15:00:00Z", kind: "pee" },
        { baby_id: babyId, occurred_at: "2026-10-03T15:00:00Z", kind: "both" },
      ],
      babyId,
      "2026-10-01",
      "2026-10-03",
      "America/Argentina/Buenos_Aires",
    );
    expect(stats.day_count).toBe(3);
    expect(stats.feed_count).toBe(3);
    expect(stats.feeds_per_day).toBeCloseTo(1);
    expect(stats.minutes_per_feed).toBeCloseTo(19);
    expect(stats.pee_per_day).toBeCloseTo(2 / 3);
    expect(stats.poop_per_day).toBe(0);
    expect(stats.both_diapers_per_day).toBeCloseTo(1 / 3);
    expect(stats.mean_gap_minutes).toBeCloseTo(745);
  });
});
