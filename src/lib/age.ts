import { es } from "../i18n/es";

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type BabyAge =
  | { kind: "days"; days: number }
  | { kind: "weeks"; weeks: number; days: number }
  | { kind: "months"; months: number };

export function parseIsoDate(value: string): CalendarDate | null {
  const match = isoDate.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function calendarDaysBetween(fromDate: string, toDate: string): number | null {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from || !to) return null;
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function completedCalendarMonths(bornOn: string, today: string): number | null {
  const born = parseIsoDate(bornOn);
  const now = parseIsoDate(today);
  if (!born || !now) return null;
  let months = (now.year - born.year) * 12 + (now.month - born.month);
  if (now.day < born.day) months -= 1;
  return months;
}

export function babyAge(bornOn: string, today: string): BabyAge | null {
  const days = calendarDaysBetween(bornOn, today);
  if (days === null || days < 0) return null;
  if (days < 14) return { kind: "days", days };
  const months = completedCalendarMonths(bornOn, today);
  if (months !== null && months >= 2) return { kind: "months", months };
  return { kind: "weeks", weeks: Math.floor(days / 7), days: days % 7 };
}

export function formatBabyAge(bornOn: string, today: string): string | null {
  const age = babyAge(bornOn, today);
  if (!age) return null;
  if (age.kind === "days") return es.ageDays(age.days);
  if (age.kind === "weeks") return es.ageWeeks(age.weeks, age.days);
  return es.ageMonths(age.months);
}

export function formatCalendarDate(isoDateValue: string): string {
  const parts = parseIsoDate(isoDateValue);
  if (!parts) return isoDateValue;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function birthDateIssue(
  value: string,
  today: string,
  required: boolean,
): "missing" | "invalid" | "future" | null {
  const trimmed = value.trim();
  if (trimmed === "") return required ? "missing" : null;
  if (!parseIsoDate(trimmed) || !parseIsoDate(today)) return "invalid";
  if (trimmed > today) return "future";
  return null;
}
