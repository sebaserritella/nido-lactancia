import { describe, expect, it } from "vitest";
import { parseMilliliters, previousBottleMl } from "./feedRules";

const babyId = "22222222-2222-2222-2222-222222222222";

describe("bottle amount", () => {
  it("accepts a whole number of milliliters and rejects anything else", () => {
    expect(parseMilliliters("90")).toBe(90);
    expect(parseMilliliters(" 120 ")).toBe(120);
    expect(parseMilliliters("")).toBeNull();
    expect(parseMilliliters("0")).toBeNull();
    expect(parseMilliliters("90.5")).toBeNull();
    expect(parseMilliliters("90ml")).toBeNull();
  });

  it("prefills from the latest bottle for that baby", () => {
    expect(
      previousBottleMl(
        [
          { baby_id: babyId, started_at: "2026-10-04T13:00:00Z", kind: "bottle", ml: 60 },
          { baby_id: babyId, started_at: "2026-10-05T13:00:00Z", kind: "breast", ml: null },
          { baby_id: babyId, started_at: "2026-10-05T16:00:00Z", kind: "bottle", ml: 90 },
          { baby_id: "other", started_at: "2026-10-05T18:00:00Z", kind: "bottle", ml: 150 },
        ],
        babyId,
      ),
    ).toBe(90);
    expect(previousBottleMl([], babyId)).toBeNull();
  });
});
