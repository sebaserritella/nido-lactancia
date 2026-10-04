import { formatMinutes } from "./format";
import { todayLocalDate, toDatetimeLocalValue } from "./localTime";

/** Local date and time. The date is omitted when the instant is today in `timeZone`. */
export function formatLatestStamp(isoUtc: string, timeZone: string, now = new Date()): string {
  const local = toDatetimeLocalValue(isoUtc, timeZone);
  const date = local.slice(0, 10);
  const time = local.slice(11);
  if (date === todayLocalDate(timeZone, now)) return time;
  return `${date} ${time}`;
}

/** Clock time only. End times stay a clock even when they fall on another day. */
export function formatLatestClock(isoUtc: string, timeZone: string): string {
  return toDatetimeLocalValue(isoUtc, timeZone).slice(11);
}

export function formatLatestFeedLine(
  startedAt: string,
  endedAt: string | null,
  timeZone: string,
  inProgressLabel: string,
  now = new Date(),
): string {
  const start = formatLatestStamp(startedAt, timeZone, now);
  if (endedAt === null) return `${start} · ${inProgressLabel}`;
  const end = formatLatestClock(endedAt, timeZone);
  const minutes = formatMinutes((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  return minutes ? `${start}–${end} · ${minutes}` : `${start}–${end}`;
}
