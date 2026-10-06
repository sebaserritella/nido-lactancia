import type { DiaperKind, RangeStats } from "../domain";
import { activeMinutes } from "./feedDuration";
import { intakeStarts, sessionKey } from "./feedSessions";
import { todayLocalDate } from "./localTime";

type FeedPoint = {
  id?: string;
  session_id?: string | null;
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  paused_ms?: number | null;
  paused_at?: string | null;
  kind?: "breast" | "bottle";
  ml?: number | null;
};

type DiaperPoint = {
  baby_id: string;
  occurred_at: string;
  kind: DiaperKind;
};

export function computeRangeStats(
  feeds: FeedPoint[],
  diapers: DiaperPoint[],
  babyId: string,
  from: string,
  to: string,
  timeZone: string,
): RangeStats {
  const dayCount = inclusiveDayCount(from, to);
  const rangedFeeds = feeds
    .filter((feed) => feed.baby_id === babyId && inRange(feed.started_at, from, to, timeZone))
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
  const rangedDiapers = diapers.filter(
    (diaper) => diaper.baby_id === babyId && inRange(diaper.occurred_at, from, to, timeZone),
  );
  const sessionMinutes = new Map<string, number>();
  rangedFeeds.forEach((feed, index) => {
    if (feed.kind === "bottle" || feed.ended_at === null) return;
    const key = sessionKey(feed, index);
    sessionMinutes.set(key, (sessionMinutes.get(key) ?? 0) + activeMinutes(feed));
  });
  const minutes = [...sessionMinutes.values()];
  const starts = intakeStarts(rangedFeeds);
  const sessionDays = sessionStartDays(rangedFeeds, timeZone);
  const gaps: number[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    gaps.push((starts[index] - starts[index - 1]) / 60000);
  }
  return {
    day_count: dayCount,
    feed_count: starts.length,
    feeds_per_day: perRecordedDay(starts.length, sessionDays),
    minutes_per_feed: minutes.length === 0 ? null : average(minutes),
    pee_per_day: diaperRate(rangedDiapers, ["pee", "both"], timeZone),
    poop_per_day: diaperRate(rangedDiapers, ["poop", "both"], timeZone),
    both_diapers_per_day: diaperRate(rangedDiapers, ["both"], timeZone),
    mean_gap_minutes: gaps.length === 0 ? null : average(gaps),
  };
}

/** Bottle count and milliliters, averaged over days that had a bottle. */
export function bottleDaily(
  feeds: { started_at: string; kind?: string; ml?: number | null }[],
  timeZone: string,
): { count: number | null; ml: number | null } {
  const bottles = feeds.filter((feed) => feed.kind === "bottle");
  const days = bottles.map((feed) => localDay(feed.started_at, timeZone));
  const recordedDays = new Set(days).size;
  if (recordedDays === 0) return { count: null, ml: null };
  const ml = bottles.reduce((sum, feed) => sum + (feed.ml ?? 0), 0);
  return { count: bottles.length / recordedDays, ml: ml / recordedDays };
}

/** Each diaper change counts once. Days with no diaper are left out of the rate. */
export function diapersChangedPerDay(diapers: { occurred_at: string }[], timeZone: string): number | null {
  return perRecordedDay(
    diapers.length,
    diapers.map((diaper) => localDay(diaper.occurred_at, timeZone)),
  );
}

function sessionStartDays(feeds: FeedPoint[], timeZone: string): string[] {
  const bySession = new Map<string, { start: number; day: string }>();
  feeds.forEach((feed, index) => {
    const key = sessionKey(feed, index);
    const start = new Date(feed.started_at).getTime();
    const current = bySession.get(key);
    if (current === undefined || start < current.start) {
      bySession.set(key, { start, day: localDay(feed.started_at, timeZone) });
    }
  });
  return [...bySession.values()].map((session) => session.day);
}

function diaperRate(diapers: DiaperPoint[], kinds: DiaperKind[], timeZone: string): number | null {
  const matching = diapers.filter((diaper) => kinds.includes(diaper.kind));
  return perRecordedDay(
    matching.length,
    matching.map((diaper) => localDay(diaper.occurred_at, timeZone)),
  );
}

function perRecordedDay(count: number, days: string[]): number | null {
  const recordedDays = new Set(days).size;
  if (recordedDays === 0) return null;
  return count / recordedDays;
}

function localDay(isoUtc: string, timeZone: string): string {
  return todayLocalDate(timeZone, new Date(isoUtc));
}

function inRange(isoUtc: string, from: string, to: string, timeZone: string): boolean {
  const day = todayLocalDate(timeZone, new Date(isoUtc));
  return day >= from && day <= to;
}

function inclusiveDayCount(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const start = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const end = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((end - start) / 86_400_000) + 1;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
