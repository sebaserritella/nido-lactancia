import { describe, expect, it } from "vitest";
import { developmentBandForMonths, developmentTipsForBaby } from "./developmentTips";

describe("developmentBandForMonths", () => {
  it.each([
    [0, "m0_3"],
    [3, "m0_3"],
    [4, "m4_6"],
    [6, "m4_6"],
    [7, "m9"],
    [10, "m9"],
    [11, "m12"],
    [14, "m12"],
    [15, "m18"],
    [20, "m18"],
    [21, "m24"],
    [24, "m24"],
  ] as const)("maps %i months to %s", (months, band) => {
    expect(developmentBandForMonths(months)).toBe(band);
  });

  it("returns null at 25+ months", () => {
    expect(developmentBandForMonths(25)).toBeNull();
    expect(developmentBandForMonths(36)).toBeNull();
  });

  it("returns null for negative months", () => {
    expect(developmentBandForMonths(-1)).toBeNull();
  });
});

describe("developmentTipsForBaby", () => {
  it("returns null when bornOn is null", () => {
    expect(developmentTipsForBaby(null, "2026-10-20")).toBeNull();
  });

  it("returns null when baby is older than 24 months", () => {
    expect(developmentTipsForBaby("2023-01-01", "2026-10-20")).toBeNull();
  });

  it("returns the 9-month band content for a ~9 month old", () => {
    const tip = developmentTipsForBaby("2026-01-20", "2026-10-20");
    expect(tip?.id).toBe("m9");
    expect(tip?.title).toBe("Alrededor de 9 meses");
    expect(tip?.expected.length).toBeGreaterThan(0);
    expect(tip?.consultIf.length).toBeGreaterThan(0);
    expect(tip?.tips.length).toBeGreaterThan(0);
  });

  it("returns null when bornOn is invalid", () => {
    expect(developmentTipsForBaby("not-a-date", "2026-10-20")).toBeNull();
  });
});
