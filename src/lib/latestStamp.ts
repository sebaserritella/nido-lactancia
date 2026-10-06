import { activeMinutes } from "./feedDuration";
import { formatMinutes } from "./format";
import { es } from "../i18n/es";
import { addCalendarDays, todayLocalDate, toDatetimeLocalValue } from "./localTime";

/** Local date and time. Today is only the clock. Yesterday and the day before use a relative word. */
export function formatLatestStamp(isoUtc: string, timeZone: string, now = new Date()): string {
  const local = toDatetimeLocalValue(isoUtc, timeZone);
  const date = local.slice(0, 10);
  const time = local.slice(11);
  const today = todayLocalDate(timeZone, now);
  if (date === today) return time;
  if (date === addCalendarDays(today, -1)) return `${es.yesterday} ${time}`;
  if (date === addCalendarDays(today, -2)) return `${es.dayBeforeYesterday} ${time}`;
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
  pausedMs = 0,
): string {
  const start = formatLatestStamp(startedAt, timeZone, now);
  if (endedAt === null) return `${start} · ${inProgressLabel}`;
  const end = formatLatestClock(endedAt, timeZone);
  const minutes = formatMinutes(activeMinutes({ started_at: startedAt, ended_at: endedAt, paused_ms: pausedMs }));
  return minutes ? `${start}–${end} · ${minutes}` : `${start}–${end}`;
}
