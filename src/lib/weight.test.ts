import { describe, expect, it } from "vitest";
import { formatKilograms, kilogramsToGrams } from "./weight";

describe("kilograms and grams", () => {
  it("converts one decimal kilogram into grams", () => {
    expect(kilogramsToGrams("3.4")).toBe(3400);
    expect(kilogramsToGrams("3,4")).toBe(3400);
    expect(kilogramsToGrams(" 3,4 ")).toBe(3400);
    expect(kilogramsToGrams("3")).toBe(3000);
    expect(kilogramsToGrams("0,1")).toBe(100);
    expect(kilogramsToGrams("29,9")).toBe(29900);
    expect(kilogramsToGrams("3,45")).toBe(3450);
    expect(kilogramsToGrams("3,270")).toBe(3270);
    expect(kilogramsToGrams("3.270")).toBe(3270);
    expect(kilogramsToGrams("3,271")).toBe(3271);
    expect(kilogramsToGrams("0,001")).toBe(1);
  });

  it("rejects empty, zero, and absurd weights", () => {
    expect(kilogramsToGrams("")).toBeNull();
    expect(kilogramsToGrams("   ")).toBeNull();
    expect(kilogramsToGrams("0")).toBeNull();
    expect(kilogramsToGrams("0,0")).toBeNull();
    expect(kilogramsToGrams("0.0")).toBeNull();
    expect(kilogramsToGrams("30")).toBeNull();
    expect(kilogramsToGrams("3,2701")).toBeNull();
    expect(kilogramsToGrams("29,9999")).toBeNull();
    expect(kilogramsToGrams("-1")).toBeNull();
    expect(kilogramsToGrams("abc")).toBeNull();
    expect(kilogramsToGrams("3,4 kg")).toBeNull();
  });

  it("shows stored grams as kilograms with up to three decimals", () => {
    expect(formatKilograms(3400)).toBe("3,4");
    expect(formatKilograms(3000)).toBe("3,0");
    expect(formatKilograms(100)).toBe("0,1");
    expect(formatKilograms(3270)).toBe("3,27");
    expect(formatKilograms(3271)).toBe("3,271");
  });
});
