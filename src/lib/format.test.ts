import { describe, expect, it } from "vitest";
import { formatElapsed, formatMinutes, formatStat } from "./format";

describe("format", () => {
  it("formats counts with one decimal in Spanish", () => {
    expect(formatStat(1)).toBe("1");
    expect(formatStat(2 / 3)).toBe("0,7");
    expect(formatStat(null)).toBeNull();
  });

  it("formats durations in minutes or hours", () => {
    expect(formatMinutes(19)).toBe("19 min");
    expect(formatMinutes(745)).toBe("12 h 25 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(null)).toBeNull();
  });

  it("formats a running timer", () => {
    expect(formatElapsed(90_000)).toBe("1:30");
    expect(formatElapsed(3_665_000)).toBe("1:01:05");
  });
});
