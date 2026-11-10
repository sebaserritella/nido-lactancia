import { describe, expect, it } from "vitest";
import { latestToma } from "./latestToma";

describe("latestToma", () => {
  it("returns null without feeds", () => {
    expect(latestToma([])).toBeNull();
  });

  it("keeps a single feed ungrouped", () => {
    const toma = latestToma([
      { started_at: "2026-10-04T17:00:00.000Z", ended_at: "2026-10-04T17:12:00.000Z", paused_ms: 0, side: "left" },
    ]);
    expect(toma).toMatchObject({ grouped: false, count: 1, sides: ["left"], minutes: 12, endedAt: "2026-10-04T17:12:00.000Z" });
  });

  it("adds up a group and ends at its last end", () => {
    const toma = latestToma([
      { started_at: "2026-10-04T17:20:00.000Z", ended_at: "2026-10-04T17:30:00.000Z", paused_ms: 60_000, side: "right" },
      { started_at: "2026-10-04T17:00:00.000Z", ended_at: "2026-10-04T17:12:00.000Z", paused_ms: 0, side: "left" },
    ]);
    expect(toma).toMatchObject({
      grouped: true,
      count: 2,
      sides: ["left", "right"],
      startedAt: "2026-10-04T17:00:00.000Z",
      endedAt: "2026-10-04T17:30:00.000Z",
      minutes: 21,
    });
  });

  it("stays open while a part is in progress and counts only finished parts", () => {
    const toma = latestToma([
      { started_at: "2026-10-04T17:00:00.000Z", ended_at: "2026-10-04T17:12:00.000Z", paused_ms: 0, side: "left" },
      { started_at: "2026-10-04T17:20:00.000Z", ended_at: null, paused_ms: 0, paused_at: "2026-10-04T17:25:00.000Z", side: "left" },
    ]);
    expect(toma).toMatchObject({ grouped: true, sides: ["left"], endedAt: null, paused: true, minutes: 12 });
  });
});
