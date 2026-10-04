type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

export function zonedTimeToUtc(localDateTime: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) {
    throw new Error("invalid local datetime");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMillis = wallClockUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    utcMillis = wallClockUtc - zoneOffsetMs(new Date(utcMillis), timeZone);
  }
  return new Date(utcMillis);
}

export function formatLocalTime(isoUtc: string, timeZone: string): string {
  const parts = zonedParts(new Date(isoUtc), timeZone);
  return `${parts.hour}:${parts.minute}`;
}

export function todayLocalDate(timeZone: string, now = new Date()): string {
  const parts = zonedParts(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error("invalid date");
  }
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function localDateRangeToUtc(
  fromDate: string,
  toDate: string,
  timeZone: string,
): { startInclusive: Date; endExclusive: Date } {
  return {
    startInclusive: zonedTimeToUtc(`${fromDate}T00:00`, timeZone),
    endExclusive: zonedTimeToUtc(`${addCalendarDays(toDate, 1)}T00:00`, timeZone),
  };
}

export function toDatetimeLocalValue(isoUtc: string, timeZone: string): string {
  const parts = zonedParts(new Date(isoUtc), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const raw = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  let hour = Number(raw.hour);
  let day = Number(raw.day);
  let month = Number(raw.month);
  let year = Number(raw.year);
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day));
    rolled.setUTCDate(rolled.getUTCDate() + 1);
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return {
    year: String(year),
    month: pad(month),
    day: pad(day),
    hour: pad(hour),
    minute: pad(Number(raw.minute)),
  };
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    0,
  );
  const instantSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - instantSeconds;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
