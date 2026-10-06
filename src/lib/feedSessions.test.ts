import { describe, expect, it } from "vitest";
import { assignSessionId, feedBlocks, groupableFeeds, tomaCount, sameFeedIdleMinutes } from "./feedSessions";

const babyId = "064b9cf6-2558-4cec-a6dc-f9a8424b3e86";

const left = feed({
  id: "left",
  started_at: "2026-10-06T13:00:00.000Z",
  ended_at: "2026-10-06T13:08:00.000Z",
  side: "left",
});
const right = feed({
  id: "right",
  started_at: "2026-10-06T13:12:00.000Z",
  ended_at: "2026-10-06T13:22:00.000Z",
  side: "right",
});
const afternoon = feed({
  id: "afternoon",
  started_at: "2026-10-06T19:40:00.000Z",
  ended_at: "2026-10-06T19:55:00.000Z",
  side: "left",
});

describe("feedBlocks", () => {
  it("suggests a pair whose idle gap is within 15 minutes and leaves a later feed alone", () => {
    expect(sameFeedIdleMinutes).toBe(15);
    const blocks = feedBlocks([afternoon, left, right], []);
    expect(blocks.map(describeBlock)).toEqual([
      "feed:afternoon",
      "feed:right",
      "suggestion:left→right:4",
      "feed:left",
    ]);
  });

  it("does not suggest a 25 minute idle gap", () => {
    const early = feed({
      id: "early",
      started_at: "2026-10-06T19:40:00.000Z",
      ended_at: "2026-10-06T19:55:00.000Z",
      side: "left",
    });
    const later = feed({
      id: "later",
      started_at: "2026-10-06T20:20:00.000Z",
      ended_at: "2026-10-06T20:32:00.000Z",
      side: "right",
    });
    expect(feedBlocks([later, early], []).some((block) => block.kind === "suggestion")).toBe(false);
  });

  it("suggests at exactly 15 minutes and not one second past it", () => {
    const first = feed({
      id: "first",
      started_at: "2026-10-06T13:00:00.000Z",
      ended_at: "2026-10-06T13:00:00.000Z",
      side: "left",
    });
    const onTheLine = feed({
      id: "line",
      started_at: "2026-10-06T13:15:00.000Z",
      ended_at: "2026-10-06T13:20:00.000Z",
      side: "right",
    });
    const past = feed({
      id: "past",
      started_at: "2026-10-06T13:15:01.000Z",
      ended_at: "2026-10-06T13:20:00.000Z",
      side: "right",
    });
    expect(feedBlocks([onTheLine, first], []).some((block) => block.kind === "suggestion")).toBe(true);
    expect(feedBlocks([past, { ...first, ended_at: "2026-10-06T13:00:00.000Z" }], []).some((block) => block.kind === "suggestion")).toBe(false);
  });

  it("hides a suggestion the parent already dismissed", () => {
    const blocks = feedBlocks([right, left], [{ earlier_feed_id: "left", later_feed_id: "right" }]);
    expect(blocks.map(describeBlock)).toEqual(["feed:right", "feed:left"]);
  });

  it("does not suggest across a bottle", () => {
    const bottle = feed({
      id: "bottle",
      started_at: "2026-10-06T13:10:00.000Z",
      ended_at: "2026-10-06T13:10:00.000Z",
      side: null,
      kind: "bottle",
    });
    expect(feedBlocks([right, bottle, left], []).some((block) => block.kind === "suggestion")).toBe(false);
  });

  it("draws one group in place of the two rows, earliest segment first", () => {
    const blocks = feedBlocks(
      [
        afternoon,
        { ...left, session_id: "session-1" },
        { ...right, session_id: "session-1" },
      ],
      [],
    );
    expect(blocks.map(describeBlock)).toEqual(["feed:afternoon", "group:session-1:left,right"]);
  });
});

describe("groupableFeeds", () => {
  it("keeps selected breast feeds and leaves a selected bottle out", () => {
    const bottle = feed({
      id: "bottle",
      started_at: "2026-10-06T23:05:00.000Z",
      ended_at: "2026-10-06T23:05:00.000Z",
      side: null,
      kind: "bottle",
    });
    const chosen = groupableFeeds([left, right, bottle], new Set(["left", "right", "bottle"]));
    expect(chosen.map((item) => item.id)).toEqual(["left", "right"]);
    expect(assignSessionId(chosen, () => "new-session")).toBe("new-session");
  });

  it("needs two breast feeds", () => {
    expect(assignSessionId(groupableFeeds([left], new Set(["left"])), () => "new-session")).toBeNull();
  });

  it("joins an existing session instead of minting a second one", () => {
    const grouped = { ...left, session_id: "session-1" };
    const chosen = groupableFeeds([grouped, right], new Set(["left", "right"]));
    expect(assignSessionId(chosen, () => "new-session")).toBe("session-1");
    expect(tomaCount(chosen)).toBe(2);
    expect(tomaCount([grouped, { ...right, session_id: "session-1" }])).toBe(1);
  });
});

function feed(row: {
  id: string;
  started_at: string;
  ended_at: string | null;
  side: "left" | "right" | "both" | null;
  kind?: "breast" | "bottle";
  session_id?: string | null;
}) {
  return { baby_id: babyId, kind: "breast" as const, session_id: null, ...row };
}

function describeBlock(block: ReturnType<typeof feedBlocks>[number]): string {
  if (block.kind === "feed") return `feed:${block.feed.id}`;
  if (block.kind === "group") return `group:${block.sessionId}:${block.feeds.map((item) => item.id).join(",")}`;
  return `suggestion:${block.earlier.id}→${block.later.id}:${block.idleMinutes}`;
}
