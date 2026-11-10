import { activeMinutes, type FeedClock } from "./feedDuration";

type TomaFeed = FeedClock & {
  side: "left" | "right" | "both" | null;
};

export type LatestToma = {
  /** True when the latest feed belongs to a group of two or more feeds. */
  grouped: boolean;
  count: number;
  /** Sides in the order they were fed, without repeats. */
  sides: ("left" | "right" | "both")[];
  startedAt: string;
  /** Last end of the group, or null while any part is still open. */
  endedAt: string | null;
  paused: boolean;
  /** Active minutes of the finished parts. */
  minutes: number;
};

/** One toma from its feeds: a single feed or every feed of its group. */
export function latestToma<T extends TomaFeed>(feeds: T[]): LatestToma | null {
  if (feeds.length === 0) return null;
  const sorted = [...feeds].sort((left, right) => left.started_at.localeCompare(right.started_at));
  const open = sorted.find((feed) => feed.ended_at === null);
  const sides: LatestToma["sides"] = [];
  let minutes = 0;
  for (const feed of sorted) {
    if (feed.side && !sides.includes(feed.side)) sides.push(feed.side);
    if (feed.ended_at !== null) minutes += activeMinutes(feed);
  }
  const ends = sorted.map((feed) => feed.ended_at).filter((end): end is string => end !== null).sort();
  return {
    grouped: sorted.length > 1,
    count: sorted.length,
    sides,
    startedAt: sorted[0].started_at,
    endedAt: open ? null : ends[ends.length - 1],
    paused: Boolean(open?.paused_at),
    minutes,
  };
}
