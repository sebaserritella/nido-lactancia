import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("lowercases and trims a real email", () => {
    expect(normalizeEmail("  Mama@Gmail.com ")).toBe("mama@gmail.com");
  });

  it("rejects a nickname and the old synthetic address", () => {
    expect(() => normalizeEmail("mama")).toThrow(/email/);
    expect(() => normalizeEmail("mama_2")).toThrow(/email/);
    expect(() => normalizeEmail("mama@nido-lactancia.local")).toThrow(/email/);
  });
});
