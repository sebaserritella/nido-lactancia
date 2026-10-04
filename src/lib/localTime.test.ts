import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  formatLocalTime,
  localDateRangeToUtc,
  todayLocalDate,
  toDatetimeLocalValue,
  zonedTimeToUtc,
} from "./localTime";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("local time", () => {
  it("stores a Buenos Aires wall time as UTC", () => {
    const utc = zonedTimeToUtc("2026-10-04T00:10", BUENOS_AIRES);
    expect(utc.toISOString()).toBe("2026-10-04T03:10:00.000Z");
  });

  it("shows a UTC instant in the device zone", () => {
    expect(formatLocalTime("2026-10-04T02:30:00.000Z", BUENOS_AIRES)).toBe("23:30");
    expect(todayLocalDate(BUENOS_AIRES, new Date("2026-10-04T02:30:00.000Z"))).toBe("2026-10-03");
  });

  it("turns an inclusive local date range into a UTC half-open interval", () => {
    const range = localDateRangeToUtc("2026-10-01", "2026-10-03", BUENOS_AIRES);
    expect(range.startInclusive.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-10-04T03:00:00.000Z");
  });

  it("formats a UTC instant for a datetime-local input", () => {
    expect(toDatetimeLocalValue("2026-10-04T03:10:00.000Z", BUENOS_AIRES)).toBe("2026-10-04T00:10");
  });

  it("adds calendar days without shifting across a timezone", () => {
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2026-10-04", -7)).toBe("2026-09-27");
  });
});
