import { describe, expect, it } from "vitest";
import { formatLatestFeedLine, formatLatestStamp } from "./latestStamp";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("latest stamp", () => {
  const now = new Date("2026-10-04T18:00:00.000Z");

  it("omits the date when the event is today in the device zone", () => {
    expect(formatLatestStamp("2026-10-04T15:32:00.000Z", BUENOS_AIRES, now)).toBe("12:32");
  });

  it("includes the local date when the event is another day", () => {
    expect(formatLatestStamp("2026-10-04T02:30:00.000Z", BUENOS_AIRES, now)).toBe("2026-10-03 23:30");
  });

  it("shows the end clock and elapsed minutes after a feed ends", () => {
    expect(formatLatestFeedLine("2026-10-04T15:32:00.000Z", "2026-10-04T15:50:00.000Z", BUENOS_AIRES, "En curso", now)).toBe(
      "12:32–12:50 · 18 min",
    );
  });

  it("keeps the end as a clock when the feed crosses midnight", () => {
    expect(formatLatestFeedLine("2026-10-04T02:30:00.000Z", "2026-10-04T03:10:00.000Z", BUENOS_AIRES, "En curso", now)).toBe(
      "2026-10-03 23:30–00:10 · 40 min",
    );
  });

  it("marks an open feed as in progress without elapsed minutes", () => {
    expect(formatLatestFeedLine("2026-10-04T15:05:00.000Z", null, BUENOS_AIRES, "En curso", now)).toBe("12:05 · En curso");
  });
});
