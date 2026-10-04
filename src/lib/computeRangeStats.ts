import type { DiaperKind, RangeStats } from "../domain";
import { todayLocalDate } from "./localTime";

type FeedPoint = {
  baby_id: string;
  started_at: string;
  ended_at: string | null;
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
  const completed = rangedFeeds.filter((feed) => feed.ended_at !== null);
  const minutes = completed.map(
    (feed) => (new Date(feed.ended_at ?? feed.started_at).getTime() - new Date(feed.started_at).getTime()) / 60000,
  );
  const gaps: number[] = [];
  for (let index = 1; index < rangedFeeds.length; index += 1) {
    gaps.push(
      (new Date(rangedFeeds[index].started_at).getTime() - new Date(rangedFeeds[index - 1].started_at).getTime()) / 60000,
    );
  }
  const pee = rangedDiapers.filter((diaper) => diaper.kind === "pee").length;
  const poop = rangedDiapers.filter((diaper) => diaper.kind === "poop").length;
  const both = rangedDiapers.filter((diaper) => diaper.kind === "both").length;
  return {
    day_count: dayCount,
    feed_count: rangedFeeds.length,
    feeds_per_day: rangedFeeds.length / dayCount,
    minutes_per_feed: minutes.length === 0 ? null : average(minutes),
    pee_per_day: pee / dayCount,
    poop_per_day: poop / dayCount,
    both_diapers_per_day: both / dayCount,
    mean_gap_minutes: gaps.length === 0 ? null : average(gaps),
  };
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
