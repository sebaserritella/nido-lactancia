import type { DiaperKind, FeedSide } from "../domain";
import { todayLocalDate } from "./localTime";

export type StatGrain = "day" | "week" | "month";

export type Portion = {
  key: FeedSide | DiaperKind;
  total: number;
  perPeriod: number;
  share: number;
};

export type PeriodStats = {
  grain: StatGrain;
  feedPeriodCount: number;
  minutesPerPeriod: number | null;
  sidePortions: Portion[];
  diaperPeriodCount: number;
  diapersPerPeriod: number | null;
  diaperPortions: Portion[];
};

type FeedPoint = {
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  side: FeedSide;
};

type DiaperPoint = {
  baby_id: string;
  occurred_at: string;
  kind: DiaperKind;
};

const sideOrder: FeedSide[] = ["left", "right", "both"];
const diaperOrder: DiaperKind[] = ["pee", "poop", "both"];

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

  const sideTotals = new Map<FeedSide, number>(sideOrder.map((side) => [side, 0]));
  for (const feed of completed) {
    const minutes = (new Date(feed.ended_at ?? feed.started_at).getTime() - new Date(feed.started_at).getTime()) / 60000;
    sideTotals.set(feed.side, (sideTotals.get(feed.side) ?? 0) + minutes);
  }
  const diaperTotals = new Map<DiaperKind, number>(diaperOrder.map((kind) => [kind, 0]));
  for (const diaper of rangedDiapers) {
    diaperTotals.set(diaper.kind, (diaperTotals.get(diaper.kind) ?? 0) + 1);
  }

  const sidePortions = portions(sideOrder, sideTotals, feedPeriods.size);
  const diaperPortions = portions(diaperOrder, diaperTotals, diaperPeriods.size);

  return {
    grain,
    feedPeriodCount: feedPeriods.size,
    minutesPerPeriod: rate(sidePortions, feedPeriods.size),
    sidePortions,
    diaperPeriodCount: diaperPeriods.size,
    diapersPerPeriod: rate(diaperPortions, diaperPeriods.size),
    diaperPortions,
  };
}

function portions<Key extends Portion["key"]>(order: Key[], totals: Map<Key, number>, periodCount: number): Portion[] {
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

function rate(items: Portion[], periodCount: number): number | null {
  if (periodCount === 0 || items.length === 0) return null;
  return items.reduce((sum, item) => sum + item.total, 0) / periodCount;
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

function localDay(isoUtc: string, timeZone: string): string {
  return todayLocalDate(timeZone, new Date(isoUtc));
}

function inRange(isoUtc: string, from: string, to: string, timeZone: string): boolean {
  const day = localDay(isoUtc, timeZone);
  return day >= from && day <= to;
}
