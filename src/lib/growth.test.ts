import { describe, expect, it } from "vitest";
import { ageInDays, formatGestation, formatPercentile, growthAgeDays, growthPercentile, lmsAt, parseGestation, valueAtZ } from "./growth";

describe("WHO growth percentiles", () => {
  it("puts the WHO median at P50", () => {
    expect(growthPercentile("weight", "male", "2026-01-01", "2026-01-01", 3.3464)).toBeCloseTo(50, 1);
    expect(growthPercentile("length", "female", "2026-01-01", "2026-01-01", 49.1477)).toBeCloseTo(50, 1);
  });

  it("matches the WHO -2 SD weight for boys at birth (2.5 kg)", () => {
    const lms = lmsAt("weight", "male", 0)!;
    expect(valueAtZ(lms, -2)).toBeCloseTo(2.46, 1);
    expect(growthPercentile("weight", "male", "2026-01-01", "2026-01-01", valueAtZ(lms, -2))).toBeCloseTo(2.3, 1);
  });

  it("interpolates between nodes", () => {
    const at4 = lmsAt("weight", "female", ageInDays("2026-01-01", "2026-05-01"))!;
    expect(at4.m).toBeGreaterThan(6.0);
    expect(at4.m).toBeLessThan(6.6);
  });

  it("needs sex, a birth date, and an age up to 24 months", () => {
    expect(growthPercentile("weight", null, "2026-01-01", "2026-02-01", 4)).toBeNull();
    expect(growthPercentile("weight", "female", null, "2026-02-01", 4)).toBeNull();
    expect(growthPercentile("weight", "female", "2026-01-01", "2025-12-01", 4)).toBeNull();
    expect(growthPercentile("weight", "female", "2020-01-01", "2026-02-01", 4)).toBeNull();
  });

  it("formats the extremes", () => {
    expect(formatPercentile(0.4)).toBe("<P1");
    expect(formatPercentile(99.6)).toBe(">P99");
    expect(formatPercentile(45.4)).toBe("P45");
  });
});

describe("corrected age", () => {
  it("subtracts the days missing to 40+0 below 37+0", () => {
    expect(growthAgeDays("2026-01-01", "2026-05-01", 34 * 7)).toBe(ageInDays("2026-01-01", "2026-05-01") - 42);
    expect(growthAgeDays("2026-01-01", "2026-05-01", 36 * 7 + 6)).toBe(ageInDays("2026-01-01", "2026-05-01") - 22);
  });
  it("keeps chronological age from 37+0 and after 2 years", () => {
    expect(growthAgeDays("2026-01-01", "2026-05-01", 37 * 7)).toBe(ageInDays("2026-01-01", "2026-05-01"));
    expect(growthAgeDays("2026-01-01", "2026-05-01", null)).toBe(ageInDays("2026-01-01", "2026-05-01"));
    expect(growthAgeDays("2024-01-01", "2026-05-01", 30 * 7)).toBe(ageInDays("2024-01-01", "2026-05-01"));
  });
  it("gives a higher percentile for a preterm baby of the same weight", () => {
    const term = growthPercentile("weight", "female", "2026-01-01", "2026-04-01", 5, null)!;
    const preterm = growthPercentile("weight", "female", "2026-01-01", "2026-04-01", 5, 33 * 7)!;
    expect(preterm).toBeGreaterThan(term);
  });
  it("has no WHO percentile before the due date", () => {
    expect(growthPercentile("weight", "female", "2026-01-01", "2026-01-10", 2, 32 * 7)).toBeNull();
  });
});

describe("gestation input", () => {
  it("reads weeks and days", () => {
    expect(parseGestation("37.1")).toBe(260);
    expect(parseGestation("37,1")).toBe(260);
    expect(parseGestation("37+1")).toBe(260);
    expect(parseGestation(" 39 ")).toBe(273);
    expect(parseGestation("")).toBeNull();
  });
  it("rejects days over 6, out of range, or other text", () => {
    expect(parseGestation("37.7")).toBeUndefined();
    expect(parseGestation("21")).toBeUndefined();
    expect(parseGestation("45")).toBeUndefined();
    expect(parseGestation("treinta")).toBeUndefined();
  });
  it("formats with the + notation", () => {
    expect(formatGestation(260)).toBe("37+1");
    expect(formatGestation(273)).toBe("39");
  });
});
