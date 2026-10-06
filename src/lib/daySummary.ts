import { activeMinutes, type FeedClock } from "./feedDuration";
import { intakeStarts } from "./feedSessions";
import { todayLocalDate } from "./localTime";

type DayFeed = FeedClock & {
  id?: string;
  session_id?: string | null;
  side: "left" | "right" | "both" | null;
  kind?: "breast" | "bottle";
  ml?: number | null;
};

type DayDiaper = {
  kind: "pee" | "poop" | "both";
};

export type DaySummary = {
  feedCount: number;
  minutes: number;
  leftMinutes: number;
  rightMinutes: number;
  meanGapMinutes: number | null;
  diaperChanges: number;
  pee: number;
  poop: number;
  bottleCount: number;
  bottleMl: number;
};

/** Totals for one local day. An open feed counts as a feed and adds no minutes. A both feed adds its minutes to each breast. A both diaper counts as pee and as poop. */
export function summarizeDay(feeds: DayFeed[], diapers: DayDiaper[]): DaySummary {
  const breasts = { left: 0, right: 0 };
  let minutes = 0;
  let bottleCount = 0;
  let bottleMl = 0;
  for (const feed of feeds) {
    if (feed.kind === "bottle") {
      bottleCount += 1;
      bottleMl += feed.ml ?? 0;
      continue;
    }
    if (feed.ended_at === null || feed.side === null) continue;
    const elapsed = activeMinutes(feed);
    minutes += elapsed;
    addBreastMinutes(feed.side, elapsed, breasts);
  }
  const starts = intakeStarts(feeds);
  let gapTotal = 0;
  for (let index = 1; index < starts.length; index += 1) {
    gapTotal += (starts[index] - starts[index - 1]) / 60_000;
  }
  return {
    feedCount: starts.length,
    minutes,
    leftMinutes: breasts.left,
    rightMinutes: breasts.right,
    meanGapMinutes: starts.length < 2 ? null : gapTotal / (starts.length - 1),
    diaperChanges: diapers.length,
    pee: diapers.filter((diaper) => diaper.kind === "pee" || diaper.kind === "both").length,
    poop: diapers.filter((diaper) => diaper.kind === "poop" || diaper.kind === "both").length,
    bottleCount,
    bottleMl,
  };
}

/** Average minutes on each breast, over days that had a completed feed. A both feed counts on both sides. */
export function sideMinutesPerDay(feeds: DayFeed[], timeZone: string): { left: number | null; right: number | null } {
  const byDay = new Map<string, { left: number; right: number }>();
  for (const feed of feeds) {
    if (feed.kind === "bottle" || feed.ended_at === null || feed.side === null) continue;
    const day = todayLocalDate(timeZone, new Date(feed.started_at));
    const bucket = byDay.get(day) ?? { left: 0, right: 0 };
    addBreastMinutes(feed.side, activeMinutes(feed), bucket);
    byDay.set(day, bucket);
  }
  if (byDay.size === 0) return { left: null, right: null };
  let left = 0;
  let right = 0;
  for (const bucket of byDay.values()) {
    left += bucket.left;
    right += bucket.right;
  }
  return { left: left / byDay.size, right: right / byDay.size };
}

function addBreastMinutes(side: DayFeed["side"], minutes: number, into: { left: number; right: number }) {
  if (side === "left" || side === "both") into.left += minutes;
  if (side === "right" || side === "both") into.right += minutes;
}
