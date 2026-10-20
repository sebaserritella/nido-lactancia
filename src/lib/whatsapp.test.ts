import { describe, expect, it } from "vitest";
import { whatsappDigits, whatsappUrl } from "./whatsapp";

describe("whatsapp", () => {
  it("builds wa.me from an Argentine mobile", () => {
    expect(whatsappDigits("11 2345-6789")).toMatch(/^54/);
    expect(whatsappUrl("11 2345-6789")).toMatch(/^https:\/\/wa\.me\/54/);
  });

  it("rejects empty or too-short input", () => {
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits("123")).toBeNull();
    expect(whatsappUrl("abc")).toBeNull();
  });
});
