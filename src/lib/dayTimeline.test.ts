import { describe, expect, it } from "vitest";
import { feedSpan, formatMinuteOfDay, hourCaption, hourTicks, hourWindow, timelinePercent, timelineWindow } from "./dayTimeline";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("day timeline", () => {
  it("places a finished feed on the local clock and clamps a feed that passes midnight", () => {
    expect(feedSpan("2026-10-04T13:00:00Z", "2026-10-04T13:18:00Z", BUENOS_AIRES)).toEqual({
      startMin: 10 * 60,
      endMin: 10 * 60 + 18,
    });
    expect(feedSpan("2026-10-04T02:30:00Z", "2026-10-04T03:10:00Z", BUENOS_AIRES)).toEqual({
      startMin: 23 * 60 + 30,
      endMin: 24 * 60,
    });
  });

  it("frames the events with padding and at least two hours", () => {
    const wide = timelineWindow([
      { startMin: 10 * 60, endMin: 10 * 60 + 18 },
      { startMin: 16 * 60 + 2, endMin: 16 * 60 + 2 },
    ]);
    expect(wide).toEqual({ from: 9 * 60 + 30, to: 16 * 60 + 32 });

    const short = timelineWindow([{ startMin: 10 * 60, endMin: 10 * 60 + 18 }]);
    expect(short.to - short.from).toBe(120);
    expect(formatMinuteOfDay(short.from)).toBe("09:09");
  });

  it("snaps the axis to whole hours and labels the grid", () => {
    const window = hourWindow([
      { startMin: 10 * 60, endMin: 10 * 60 + 18 },
      { startMin: 16 * 60 + 2, endMin: 16 * 60 + 2 },
    ]);
    expect(window).toEqual({ from: 9 * 60, to: 17 * 60 });
    expect(hourTicks(window)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => hour * 60));
    expect(hourCaption(9 * 60, window)).toBe("09");
    expect(hourCaption(10 * 60, window)).toBe("10");
    expect(hourCaption(11 * 60, window)).toBeNull();
    expect(hourCaption(17 * 60, window)).toBe("17");
  });

  it("maps a minute onto the window as a percentage", () => {
    const window = { from: 9 * 60 + 30, to: 16 * 60 + 32 };
    expect(timelinePercent(window, 10 * 60)).toBeCloseTo(((10 * 60 - window.from) / (window.to - window.from)) * 100);
  });
});
