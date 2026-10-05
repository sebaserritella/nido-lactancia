import { toDatetimeLocalValue } from "./localTime";

const MINUTES_PER_DAY = 24 * 60;
const PAD_MINUTES = 30;
const MIN_WINDOW_MINUTES = 120;

export type MinuteSpan = {
  startMin: number;
  endMin: number;
};

export function localMinutes(isoUtc: string, timeZone: string): number {
  const clock = toDatetimeLocalValue(isoUtc, timeZone).slice(11);
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute;
}

export function feedSpan(startedAt: string, endedAt: string | null, timeZone: string, now = new Date()): MinuteSpan {
  const startMin = localMinutes(startedAt, timeZone);
  if (endedAt === null) {
    const endMin = localMinutes(now.toISOString(), timeZone);
    return { startMin, endMin: Math.max(startMin + 1, endMin) };
  }
  const startDay = toDatetimeLocalValue(startedAt, timeZone).slice(0, 10);
  const endDay = toDatetimeLocalValue(endedAt, timeZone).slice(0, 10);
  const endMin = endDay > startDay ? MINUTES_PER_DAY : localMinutes(endedAt, timeZone);
  return { startMin, endMin: Math.max(startMin + 1, endMin) };
}

/** Keeps the day's events in view, with half an hour of air and at least two hours of axis. */
export function timelineWindow(spans: MinuteSpan[]): { from: number; to: number } {
  if (spans.length === 0) return { from: 8 * 60, to: 20 * 60 };
  const start = Math.min(...spans.map((span) => span.startMin));
  const end = Math.max(...spans.map((span) => span.endMin));
  let from = Math.max(0, start - PAD_MINUTES);
  let to = Math.min(MINUTES_PER_DAY, Math.max(end, start + 1) + PAD_MINUTES);
  if (to - from < MIN_WINDOW_MINUTES) {
    const middle = (from + to) / 2;
    from = Math.max(0, middle - MIN_WINDOW_MINUTES / 2);
    to = Math.min(MINUTES_PER_DAY, from + MIN_WINDOW_MINUTES);
    if (to - from < MIN_WINDOW_MINUTES) from = Math.max(0, to - MIN_WINDOW_MINUTES);
  }
  return { from, to };
}

/** Snaps the fitted window onto whole hours so the grid lines land on the clock. */
export function hourWindow(spans: MinuteSpan[]): { from: number; to: number } {
  const fitted = timelineWindow(spans);
  const from = Math.floor(fitted.from / 60) * 60;
  const to = Math.min(MINUTES_PER_DAY, Math.ceil(fitted.to / 60) * 60);
  return { from, to: Math.max(to, from + 60) };
}

export function hourTicks(window: { from: number; to: number }): number[] {
  const ticks: number[] = [];
  for (let minute = Math.ceil(window.from / 60) * 60; minute <= window.to; minute += 60) {
    ticks.push(minute);
  }
  return ticks;
}

/** Hour number for the axis. Dense ranges keep every other hour, plus both edges. */
export function hourCaption(minute: number, window: { from: number; to: number }): string | null {
  const spanHours = (window.to - window.from) / 60;
  const edge = minute === window.from || minute === window.to;
  if (spanHours < 8 || minute % 120 === 0 || edge) return formatMinuteOfDay(minute).slice(0, 2);
  return null;
}

export function timelinePercent(window: { from: number; to: number }, minute: number): number {
  const span = window.to - window.from;
  return ((minute - window.from) / span) * 100;
}

export function formatMinuteOfDay(minute: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minute)));
  const hour = Math.floor(clamped / 60) % 24;
  const rest = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
