import { describe, expect, it } from "vitest";
import { centimetersToMillimeters, formatCentimeters } from "./length";

describe("centimeters and millimeters", () => {
  it("converts centimeters with up to one decimal into millimeters", () => {
    expect(centimetersToMillimeters("52")).toBe(520);
    expect(centimetersToMillimeters("52,5")).toBe(525);
    expect(centimetersToMillimeters("52.5")).toBe(525);
    expect(centimetersToMillimeters(" 52,5 ")).toBe(525);
    expect(centimetersToMillimeters("20")).toBe(200);
    expect(centimetersToMillimeters("120")).toBe(1200);
  });

  it("rejects empty, out of range, and bad input", () => {
    expect(centimetersToMillimeters("")).toBeNull();
    expect(centimetersToMillimeters("19,9")).toBeNull();
    expect(centimetersToMillimeters("120,1")).toBeNull();
    expect(centimetersToMillimeters("52,55")).toBeNull();
    expect(centimetersToMillimeters("abc")).toBeNull();
  });

  it("formats millimeters as centimeters", () => {
    expect(formatCentimeters(520)).toBe("52,0");
    expect(formatCentimeters(525)).toBe("52,5");
  });
});
