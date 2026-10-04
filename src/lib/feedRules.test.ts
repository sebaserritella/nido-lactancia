import { describe, expect, it } from "vitest";
import { validateFeedInterval } from "./feedRules";

describe("validateFeedInterval", () => {
  it("accepts an open feed", () => {
    expect(validateFeedInterval(new Date("2026-10-04T03:10:00.000Z"), null)).toBe("ok");
  });

  it("accepts an end after the start", () => {
    expect(
      validateFeedInterval(
        new Date("2026-10-04T03:10:00.000Z"),
        new Date("2026-10-04T03:28:00.000Z"),
      ),
    ).toBe("ok");
  });

  it("rejects an end that is not after the start", () => {
    expect(
      validateFeedInterval(
        new Date("2026-10-04T03:10:00.000Z"),
        new Date("2026-10-04T03:10:00.000Z"),
      ),
    ).toBe("end_before_start");
  });
});
