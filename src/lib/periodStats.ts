import type { DiaperKind, FeedSide } from "../domain";
import { activeMinutes } from "./feedDuration";
import { addCalendarDays, todayLocalDate } from "./localTime";

export type StatGrain = "day" | "week" | "month";

export type Portion = {
  key: "left" | "right" | "pee" | "poop";
  total: number;
  perPeriod: number;
  share: number;
};

export type PeriodBucket = {
  key: string;
  leftMinutes: number;
  rightMinutes: number;
  pee: number;
  poop: number;
};

export type PeriodStats = {
  grain: StatGrain;
  feedPeriodCount: number;
  minutesPerPeriod: number | null;
  sidePortions: Portion[];
  diaperPeriodCount: number;
  diapersPerPeriod: number | null;
  diaperPortions: Portion[];
  buckets: PeriodBucket[];
};

type FeedPoint = {
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  paused_ms?: number | null;
  paused_at?: string | null;
  side: FeedSide;
};

type DiaperPoint = {
  baby_id: string;
  occurred_at: string;
  kind: DiaperKind;
};

const sideOrder = ["left", "right"] as const;
const diaperOrder = ["pee", "poop"] as const;

export function summarizePeriod(
  feeds: FeedPoint[],
  diapers: DiaperPoint[],
  babyId: string,
  from: string,
  to: string,
  timeZone: string,
  grain: StatGrain,
): PeriodStats {
  const completed = feeds.filter(
    (feed) =>
      feed.baby_id === babyId &&
      feed.ended_at !== null &&
      inRange(feed.started_at, from, to, timeZone),
  );
  const rangedDiapers = diapers.filter(
    (diaper) => diaper.baby_id === babyId && inRange(diaper.occurred_at, from, to, timeZone),
  );

  const feedPeriods = new Set(completed.map((feed) => periodKey(localDay(feed.started_at, timeZone), grain)));
  const diaperPeriods = new Set(rangedDiapers.map((diaper) => periodKey(localDay(diaper.occurred_at, timeZone), grain)));

  const sideTotals = new Map<(typeof sideOrder)[number], number>(sideOrder.map((side) => [side, 0]));
  let actualMinutes = 0;
  for (const feed of completed) {
    const minutes = activeMinutes(feed);
    actualMinutes += minutes;
    addSideMinutes(sideTotals, feed.side, minutes);
  }
  const diaperTotals = new Map<(typeof diaperOrder)[number], number>(diaperOrder.map((kind) => [kind, 0]));
  for (const diaper of rangedDiapers) {
    if (diaper.kind === "pee" || diaper.kind === "both") diaperTotals.set("pee", (diaperTotals.get("pee") ?? 0) + 1);
    if (diaper.kind === "poop" || diaper.kind === "both") diaperTotals.set("poop", (diaperTotals.get("poop") ?? 0) + 1);
  }

  const sidePortions = portions(sideOrder, sideTotals, feedPeriods.size);
  const diaperPortions = portions(diaperOrder, diaperTotals, diaperPeriods.size);

  return {
    grain,
    feedPeriodCount: feedPeriods.size,
    minutesPerPeriod: feedPeriods.size === 0 ? null : actualMinutes / feedPeriods.size,
    sidePortions,
    diaperPeriodCount: diaperPeriods.size,
    diapersPerPeriod: diaperPeriods.size === 0 ? null : rangedDiapers.length / diaperPeriods.size,
    diaperPortions,
    buckets: buildBuckets(completed, rangedDiapers, from, to, timeZone, grain),
  };
}

export function shiftRange(from: string, to: string, direction: -1 | 1): { from: string; to: string } {
  const span = inclusiveDayCount(from, to);
  const delta = direction * span;
  return { from: addCalendarDays(from, delta), to: addCalendarDays(to, delta) };
}

function addSideMinutes(totals: Map<"left" | "right", number>, side: FeedSide, minutes: number) {
  if (side === "left" || side === "both") totals.set("left", (totals.get("left") ?? 0) + minutes);
  if (side === "right" || side === "both") totals.set("right", (totals.get("right") ?? 0) + minutes);
}

function portions<Key extends Portion["key"]>(order: readonly Key[], totals: Map<Key, number>, periodCount: number): Portion[] {
  const total = order.reduce((sum, key) => sum + (totals.get(key) ?? 0), 0);
  if (periodCount === 0 || total <= 0) return [];
  return order
    .filter((key) => (totals.get(key) ?? 0) > 0)
    .map((key) => {
      const amount = totals.get(key) ?? 0;
      return {
        key,
        total: amount,
        perPeriod: amount / periodCount,
        share: amount / total,
      };
    });
}

function periodKey(localDate: string, grain: StatGrain): string {
  if (grain === "day") return localDate;
  if (grain === "month") return localDate.slice(0, 7);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new Error("invalid date");
  }
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = utc.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  utc.setUTCDate(utc.getUTCDate() + mondayOffset);
  return utc.toISOString().slice(0, 10);
}

function buildBuckets(
  feeds: FeedPoint[],
  diapers: DiaperPoint[],
  from: string,
  to: string,
  timeZone: string,
  grain: StatGrain,
): PeriodBucket[] {
  const keys = periodKeysInRange(from, to, grain);
  const byKey = new Map(keys.map((key) => [key, emptyBucket(key)]));
  for (const feed of feeds) {
    const bucket = byKey.get(periodKey(localDay(feed.started_at, timeZone), grain));
    if (!bucket || feed.ended_at === null) continue;
    const minutes = activeMinutes(feed);
    if (feed.side === "left" || feed.side === "both") bucket.leftMinutes += minutes;
    if (feed.side === "right" || feed.side === "both") bucket.rightMinutes += minutes;
  }
  for (const diaper of diapers) {
    const bucket = byKey.get(periodKey(localDay(diaper.occurred_at, timeZone), grain));
    if (!bucket) continue;
    if (diaper.kind === "pee" || diaper.kind === "both") bucket.pee += 1;
    if (diaper.kind === "poop" || diaper.kind === "both") bucket.poop += 1;
  }
  return keys.map((key) => byKey.get(key) ?? emptyBucket(key));
}

function emptyBucket(key: string): PeriodBucket {
  return { key, leftMinutes: 0, rightMinutes: 0, pee: 0, poop: 0 };
}

function periodKeysInRange(from: string, to: string, grain: StatGrain): string[] {
  if (grain === "month") {
    const keys: string[] = [];
    let cursor = from.slice(0, 7);
    const end = to.slice(0, 7);
    while (cursor <= end) {
      keys.push(cursor);
      cursor = nextMonth(cursor);
    }
    return keys;
  }
  const start = grain === "week" ? periodKey(from, "week") : from;
  const end = grain === "week" ? periodKey(to, "week") : to;
  const step = grain === "week" ? 7 : 1;
  const keys: string[] = [];
  for (let day = start; day <= end; day = addCalendarDays(day, step)) {
    keys.push(day);
  }
  return keys;
}

function nextMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function inclusiveDayCount(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000) + 1;
}

function localDay(isoUtc: string, timeZone: string): string {
  return todayLocalDate(timeZone, new Date(isoUtc));
}

function inRange(isoUtc: string, from: string, to: string, timeZone: string): boolean {
  const day = localDay(isoUtc, timeZone);
  return day >= from && day <= to;
}
