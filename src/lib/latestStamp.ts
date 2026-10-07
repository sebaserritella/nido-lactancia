import { activeMinutes } from "./feedDuration";
import { formatMinutes } from "./format";
import { es } from "../i18n/es";
import { addCalendarDays, todayLocalDate, toDatetimeLocalValue } from "./localTime";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Relative "Hace…" under 24h; otherwise local date/time (today clock, ayer/anteayer, or date). */
export function formatLatestStamp(isoUtc: string, timeZone: string, now = new Date()): string {
  const elapsedMs = now.getTime() - new Date(isoUtc).getTime();
  if (elapsedMs < DAY_MS) return formatHace(elapsedMs);
  return formatCalendarStamp(isoUtc, timeZone, now);
}

/** Local date and time. Today is only the clock. Yesterday and the day before use a relative word. */
function formatCalendarStamp(isoUtc: string, timeZone: string, now: Date): string {
  const local = toDatetimeLocalValue(isoUtc, timeZone);
  const date = local.slice(0, 10);
  const time = local.slice(11);
  const today = todayLocalDate(timeZone, now);
  if (date === today) return time;
  if (date === addCalendarDays(today, -1)) return `${es.yesterday} ${time}`;
  if (date === addCalendarDays(today, -2)) return `${es.dayBeforeYesterday} ${time}`;
  return `${date} ${time}`;
}

export function formatHace(elapsedMs: number): string {
  const totalMinutes = Math.floor(Math.max(0, elapsedMs) / 60_000);
  if (totalMinutes < 1) return es.agoLessThanMinute;
  if (totalMinutes < 60) return es.agoMinutes(totalMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return es.agoHours(hours, minutes);
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
  if (endedAt === null) return inProgressLabel;
  const when = formatLatestStamp(endedAt, timeZone, now);
  const minutes = formatMinutes(activeMinutes({ started_at: startedAt, ended_at: endedAt, paused_ms: pausedMs }));
  return minutes ? `${when} · ${minutes}` : when;
}
