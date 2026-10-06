import { describe, expect, it } from "vitest";
import { bottleDaily, computeRangeStats, diapersChangedPerDay } from "./computeRangeStats";

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
    expect(stats.feeds_per_day).toBeCloseTo(1.5);
    expect(stats.minutes_per_feed).toBeCloseTo(19);
    expect(stats.pee_per_day).toBe(1);
    expect(stats.poop_per_day).toBe(1);
    expect(stats.both_diapers_per_day).toBe(1);
    expect(stats.mean_gap_minutes).toBeCloseTo(745);
    expect(diapersChangedPerDay(
      [
        { occurred_at: "2026-10-01T15:00:00Z" },
        { occurred_at: "2026-10-02T15:00:00Z" },
        { occurred_at: "2026-10-03T15:00:00Z" },
      ],
      "America/Argentina/Buenos_Aires",
    )).toBe(1);
  });

  it("counts each diaper change once, including a both diaper", () => {
    expect(
      diapersChangedPerDay(
        [{ occurred_at: "2026-10-01T15:00:00Z" }, { occurred_at: "2026-10-01T18:00:00Z" }],
        "America/Argentina/Buenos_Aires",
      ),
    ).toBe(2);
    expect(diapersChangedPerDay([], "America/Argentina/Buenos_Aires")).toBeNull();
  });

  it("subtracts paused minutes from the feed average", () => {
    const stats = computeRangeStats(
      [
        {
          baby_id: babyId,
          started_at: "2026-10-01T15:00:00Z",
          ended_at: "2026-10-01T15:20:00Z",
          paused_ms: 5 * 60 * 1000,
        },
      ],
      [],
      babyId,
      "2026-10-01",
      "2026-10-01",
      "America/Argentina/Buenos_Aires",
    );
    expect(stats.minutes_per_feed).toBeCloseTo(15);
  });

  it("skips days without that statistic and keeps a short feed under one minute", () => {
    const stats = computeRangeStats(
      [{ baby_id: babyId, started_at: "2026-10-01T15:00:00Z", ended_at: "2026-10-01T15:00:30Z" }],
      [
        { baby_id: babyId, occurred_at: "2026-10-01T15:00:00Z", kind: "poop" },
        { baby_id: babyId, occurred_at: "2026-10-02T15:00:00Z", kind: "pee" },
        { baby_id: babyId, occurred_at: "2026-10-02T18:00:00Z", kind: "pee" },
      ],
      babyId,
      "2026-10-01",
      "2026-10-03",
      "America/Argentina/Buenos_Aires",
    );
    expect(stats.feeds_per_day).toBe(1);
    expect(stats.minutes_per_feed).toBeCloseTo(0.5);
    expect(stats.pee_per_day).toBe(2);
    expect(stats.poop_per_day).toBe(1);
    expect(stats.both_diapers_per_day).toBeNull();
    expect(stats.mean_gap_minutes).toBeNull();
  });

  it("counts a bottle as a feed and keeps its milliliters out of the minute average", () => {
    const stats = computeRangeStats(
      [
        { baby_id: babyId, started_at: "2026-10-01T03:10:00Z", ended_at: "2026-10-01T03:28:00Z", kind: "breast" },
        {
          baby_id: babyId,
          started_at: "2026-10-01T06:40:00Z",
          ended_at: "2026-10-01T06:40:00Z",
          kind: "bottle",
          ml: 90,
        },
      ],
      [],
      babyId,
      "2026-10-01",
      "2026-10-01",
      "America/Argentina/Buenos_Aires",
    );
    expect(stats.feed_count).toBe(2);
    expect(stats.minutes_per_feed).toBeCloseTo(18);
    expect(bottleDaily(
      [{ started_at: "2026-10-01T06:40:00Z", kind: "bottle", ml: 90 }],
      "America/Argentina/Buenos_Aires",
    )).toEqual({ count: 1, ml: 90 });
  });

  it("counts a grouped pair as one feed and averages the sum of its minutes", () => {
    const stats = computeRangeStats(
      [
        {
          id: "left",
          session_id: "session-1",
          baby_id: babyId,
          started_at: "2026-10-06T13:00:00.000Z",
          ended_at: "2026-10-06T13:08:00.000Z",
          kind: "breast",
        },
        {
          id: "right",
          session_id: "session-1",
          baby_id: babyId,
          started_at: "2026-10-06T13:12:00.000Z",
          ended_at: "2026-10-06T13:22:00.000Z",
          kind: "breast",
        },
        {
          id: "afternoon",
          baby_id: babyId,
          started_at: "2026-10-06T19:40:00.000Z",
          ended_at: "2026-10-06T19:55:00.000Z",
          kind: "breast",
        },
      ],
      [],
      babyId,
      "2026-10-06",
      "2026-10-06",
      "America/Argentina/Buenos_Aires",
    );
    expect(stats.feed_count).toBe(2);
    expect(stats.feeds_per_day).toBe(2);
    expect(stats.minutes_per_feed).toBeCloseTo(16.5);
    expect(stats.mean_gap_minutes).toBe(400);
  });

  it("returns no per-day rate when the range has no records", () => {
    const stats = computeRangeStats([], [], babyId, "2026-10-01", "2026-10-03", "America/Argentina/Buenos_Aires");
    expect(stats.day_count).toBe(3);
    expect(stats.feed_count).toBe(0);
    expect(stats.feeds_per_day).toBeNull();
    expect(stats.minutes_per_feed).toBeNull();
    expect(stats.pee_per_day).toBeNull();
    expect(stats.poop_per_day).toBeNull();
    expect(stats.both_diapers_per_day).toBeNull();
    expect(stats.mean_gap_minutes).toBeNull();
  });
});
