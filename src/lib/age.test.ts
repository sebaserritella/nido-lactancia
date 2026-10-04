import { describe, expect, it } from "vitest";
import { babyAge, formatBabyAge, formatCalendarDate } from "./age";

describe("baby age", () => {
  it("uses days before two weeks, then weeks and days, then calendar months", () => {
    expect(babyAge("2026-10-04", "2026-10-04")).toEqual({ kind: "days", days: 0 });
    expect(babyAge("2026-10-03", "2026-10-04")).toEqual({ kind: "days", days: 1 });
    expect(babyAge("2026-09-21", "2026-10-04")).toEqual({ kind: "days", days: 13 });
    expect(babyAge("2026-09-20", "2026-10-04")).toEqual({ kind: "weeks", weeks: 2, days: 0 });
    expect(babyAge("2026-09-19", "2026-10-04")).toEqual({ kind: "weeks", weeks: 2, days: 1 });
    expect(babyAge("2026-01-15", "2026-03-14")).toEqual({ kind: "weeks", weeks: 8, days: 2 });
    expect(babyAge("2026-01-15", "2026-03-15")).toEqual({ kind: "months", months: 2 });
    expect(babyAge("2025-08-04", "2026-10-04")).toEqual({ kind: "months", months: 14 });
  });

  it("ignores a future or impossible birth date", () => {
    expect(babyAge("2026-10-05", "2026-10-04")).toBeNull();
    expect(babyAge("2026-02-31", "2026-10-04")).toBeNull();
  });

  it("formats a short Spanish age and keeps the calendar day", () => {
    expect(formatBabyAge("2026-10-04", "2026-10-04")).toBe("0 días");
    expect(formatBabyAge("2026-10-03", "2026-10-04")).toBe("1 día");
    expect(formatBabyAge("2026-09-20", "2026-10-04")).toBe("2 sem");
    expect(formatBabyAge("2026-09-19", "2026-10-04")).toBe("2 sem y 1 día");
    expect(formatBabyAge("2026-09-17", "2026-10-04")).toBe("2 sem y 3 días");
    expect(formatBabyAge("2026-01-15", "2026-03-15")).toBe("2 meses");
    expect(formatCalendarDate("2026-10-04")).toMatch(/4/);
    expect(formatCalendarDate("2026-10-04")).toMatch(/2026/);
    expect(formatCalendarDate("2026-10-04")).not.toMatch(/3 oct|5 oct|03|05/);
  });
});
