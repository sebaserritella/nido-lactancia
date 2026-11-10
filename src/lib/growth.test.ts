import { describe, expect, it } from "vitest";
import { ageInDays, formatPercentile, growthPercentile, lmsAt, valueAtZ } from "./growth";

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
