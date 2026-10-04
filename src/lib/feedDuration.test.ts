import { describe, expect, it } from "vitest";
import { activeElapsedMs, activeMinutes, closePause } from "./feedDuration";

const start = "2026-10-04T13:00:00.000Z";

describe("feed duration", () => {
  it("counts the whole interval when the feed was never paused", () => {
    const feed = { started_at: start, ended_at: "2026-10-04T13:18:00.000Z", paused_ms: 0, paused_at: null };
    expect(activeMinutes(feed)).toBe(18);
  });

  it("freezes elapsed time while a pause is open", () => {
    const feed = {
      started_at: start,
      ended_at: null,
      paused_ms: 0,
      paused_at: "2026-10-04T13:10:00.000Z",
    };
    const now = new Date("2026-10-04T13:25:00.000Z").getTime();
    expect(activeElapsedMs(feed, now)).toBe(10 * 60 * 1000);
  });

  it("subtracts finished pauses from a completed feed", () => {
    const feed = {
      started_at: start,
      ended_at: "2026-10-04T13:20:00.000Z",
      paused_ms: 5 * 60 * 1000,
      paused_at: null,
    };
    expect(activeMinutes(feed)).toBe(15);
  });

  it("folds an open pause into paused_ms when resuming or ending", () => {
    const feed = {
      started_at: start,
      ended_at: null,
      paused_ms: 60_000,
      paused_at: "2026-10-04T13:10:00.000Z",
    };
    const now = new Date("2026-10-04T13:12:00.000Z").getTime();
    expect(closePause(feed, now)).toEqual({ paused_ms: 3 * 60 * 1000, paused_at: null });
  });
});
