import { describe, expect, it } from "vitest";
import { shiftRange, summarizePeriod } from "./periodStats";

const babyId = "22222222-2222-2222-2222-222222222222";
const zone = "America/Argentina/Buenos_Aires";

const octoberFeeds = [
  { baby_id: babyId, started_at: "2026-10-01T03:10:00Z", ended_at: "2026-10-01T03:28:00Z", side: "left" as const },
  { baby_id: babyId, started_at: "2026-10-01T06:00:00Z", ended_at: "2026-10-01T06:20:00Z", side: "right" as const },
  { baby_id: babyId, started_at: "2026-10-02T04:00:00Z", ended_at: null, side: "both" as const },
  { baby_id: babyId, started_at: "2026-10-01T02:30:00Z", ended_at: "2026-10-01T02:40:00Z", side: "left" as const },
];

const octoberDiapers = [
  { baby_id: babyId, occurred_at: "2026-10-01T15:00:00Z", kind: "pee" as const },
  { baby_id: babyId, occurred_at: "2026-10-02T15:00:00Z", kind: "pee" as const },
  { baby_id: babyId, occurred_at: "2026-10-03T15:00:00Z", kind: "both" as const },
];

describe("summarizePeriod", () => {
  it("averages completed minutes and diapers per local day, with side and kind shares", () => {
    const stats = summarizePeriod(octoberFeeds, octoberDiapers, babyId, "2026-10-01", "2026-10-03", zone, "day");

    expect(stats.feedPeriodCount).toBe(1);
    expect(stats.minutesPerPeriod).toBeCloseTo(38);
    expect(stats.sidePortions.map((portion) => portion.key)).toEqual(["left", "right"]);
    expect(stats.sidePortions[0].total).toBeCloseTo(18);
    expect(stats.sidePortions[0].perPeriod).toBeCloseTo(18);
    expect(stats.sidePortions[0].share).toBeCloseTo(18 / 38);
    expect(stats.sidePortions[1].total).toBeCloseTo(20);
    expect(stats.sidePortions[1].share).toBeCloseTo(20 / 38);

    expect(stats.diaperPeriodCount).toBe(3);
    expect(stats.diapersPerPeriod).toBeCloseTo(1);
    expect(stats.diaperPortions.map((portion) => portion.key)).toEqual(["pee", "both"]);
    expect(stats.diaperPortions[0].total).toBe(2);
    expect(stats.diaperPortions[0].perPeriod).toBeCloseTo(2 / 3);
    expect(stats.diaperPortions[0].share).toBeCloseTo(2 / 3);
    expect(stats.diaperPortions[1].total).toBe(1);
    expect(stats.diaperPortions[1].share).toBeCloseTo(1 / 3);

    expect(stats.buckets.map((bucket) => bucket.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(stats.buckets[0]).toMatchObject({ leftMinutes: 18, rightMinutes: 20, bothSideMinutes: 0, pee: 1, poop: 0, bothDiapers: 0 });
    expect(stats.buckets[1]).toMatchObject({ leftMinutes: 0, rightMinutes: 0, bothSideMinutes: 0, pee: 1, bothDiapers: 0 });
    expect(stats.buckets[2]).toMatchObject({ leftMinutes: 0, pee: 0, bothDiapers: 1 });
  });

  it("uses one week and one month when the recorded days share them", () => {
    const week = summarizePeriod(octoberFeeds, octoberDiapers, babyId, "2026-10-01", "2026-10-03", zone, "week");
    const month = summarizePeriod(octoberFeeds, octoberDiapers, babyId, "2026-10-01", "2026-10-03", zone, "month");

    expect(week.feedPeriodCount).toBe(1);
    expect(week.minutesPerPeriod).toBeCloseTo(38);
    expect(week.diaperPeriodCount).toBe(1);
    expect(week.diapersPerPeriod).toBeCloseTo(3);
    expect(week.diaperPortions[0].perPeriod).toBeCloseTo(2);

    expect(month.feedPeriodCount).toBe(1);
    expect(month.minutesPerPeriod).toBeCloseTo(38);
    expect(month.diapersPerPeriod).toBeCloseTo(3);
    expect(week.buckets.map((bucket) => bucket.key)).toEqual(["2026-09-28"]);
    expect(week.buckets[0]).toMatchObject({ leftMinutes: 18, rightMinutes: 20, pee: 2, bothDiapers: 1 });
    expect(month.buckets.map((bucket) => bucket.key)).toEqual(["2026-10"]);
  });

  it("splits weeks on Monday and months on the first", () => {
    const feeds = [
      { baby_id: babyId, started_at: "2026-10-04T15:00:00Z", ended_at: "2026-10-04T15:10:00Z", side: "left" as const },
      { baby_id: babyId, started_at: "2026-10-05T15:00:00Z", ended_at: "2026-10-05T15:10:00Z", side: "right" as const },
      { baby_id: babyId, started_at: "2026-11-01T15:00:00Z", ended_at: "2026-11-01T15:30:00Z", side: "both" as const },
    ];
    const weeks = summarizePeriod(feeds, [], babyId, "2026-10-04", "2026-11-01", zone, "week");
    const months = summarizePeriod(feeds, [], babyId, "2026-10-04", "2026-11-01", zone, "month");

    expect(weeks.feedPeriodCount).toBe(3);
    expect(weeks.minutesPerPeriod).toBeCloseTo(50 / 3);
    expect(months.feedPeriodCount).toBe(2);
    expect(months.minutesPerPeriod).toBeCloseTo(25);
    expect(months.sidePortions.map((portion) => portion.key)).toEqual(["left", "right", "both"]);
  });

  it("ignores an open feed and returns no rates when nothing was recorded", () => {
    const openOnly = summarizePeriod(
      [{ baby_id: babyId, started_at: "2026-10-02T04:00:00Z", ended_at: null, side: "both" }],
      [],
      babyId,
      "2026-10-01",
      "2026-10-03",
      zone,
      "day",
    );
    expect(openOnly.feedPeriodCount).toBe(0);
    expect(openOnly.minutesPerPeriod).toBeNull();
    expect(openOnly.sidePortions).toEqual([]);
    expect(openOnly.diapersPerPeriod).toBeNull();

    const empty = summarizePeriod([], [], babyId, "2026-10-01", "2026-10-03", zone, "month");
    expect(empty.minutesPerPeriod).toBeNull();
    expect(empty.diapersPerPeriod).toBeNull();
    expect(empty.buckets.map((bucket) => bucket.key)).toEqual(["2026-10"]);
    expect(empty.buckets[0]).toMatchObject({ leftMinutes: 0, pee: 0 });
  });

  it("excludes paused minutes from the day total", () => {
    const stats = summarizePeriod(
      [
        {
          baby_id: babyId,
          started_at: "2026-10-01T03:00:00Z",
          ended_at: "2026-10-01T03:20:00Z",
          paused_ms: 5 * 60 * 1000,
          side: "left" as const,
        },
      ],
      [],
      babyId,
      "2026-10-01",
      "2026-10-01",
      zone,
      "day",
    );
    expect(stats.minutesPerPeriod).toBeCloseTo(15);
    expect(stats.buckets[0].leftMinutes).toBeCloseTo(15);
  });

  it("slides the date window by its own length", () => {
    expect(shiftRange("2026-10-01", "2026-10-03", -1)).toEqual({ from: "2026-09-28", to: "2026-09-30" });
    expect(shiftRange("2026-10-01", "2026-10-03", 1)).toEqual({ from: "2026-10-04", to: "2026-10-06" });
  });
});
