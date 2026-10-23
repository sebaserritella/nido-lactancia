import { describe, expect, it } from "vitest";
import { activeElapsedMs, activeMinutes, beginPause, closePause, endPause } from "./feedDuration";

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

  it("beginPause stamps paused_at so the timer can freeze before the server answers", () => {
    const feed = { started_at: start, ended_at: null, paused_ms: 0, paused_at: null };
    const at = "2026-10-04T13:05:00.000Z";
    expect(beginPause(feed, at)).toEqual({ ...feed, paused_at: at });
    expect(beginPause({ ...feed, paused_at: at }, at)).toBeNull();
    expect(beginPause({ ...feed, ended_at: at }, at)).toBeNull();
  });

  it("endPause folds the open pause and clears paused_at for an optimistic resume", () => {
    const feed = {
      started_at: start,
      ended_at: null,
      paused_ms: 60_000,
      paused_at: "2026-10-04T13:10:00.000Z",
    };
    const now = new Date("2026-10-04T13:12:00.000Z").getTime();
    expect(endPause(feed, now)).toEqual({ ...feed, paused_ms: 3 * 60 * 1000, paused_at: null });
    expect(endPause({ ...feed, paused_at: null }, now)).toBeNull();
  });
});
