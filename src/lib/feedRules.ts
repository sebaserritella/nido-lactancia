export type FeedIntervalResult = "ok" | "end_before_start";

export function parseMilliliters(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}

export function previousBottleMl(
  feeds: { baby_id: string; started_at: string; kind?: string; ml?: number | null }[],
  babyId: string,
): number | null {
  const latest = feeds
    .filter((feed) => feed.baby_id === babyId && feed.kind === "bottle" && typeof feed.ml === "number")
    .sort((left, right) => right.started_at.localeCompare(left.started_at))[0];
  return latest?.ml ?? null;
}

export function validateFeedInterval(start: Date, end: Date | null): FeedIntervalResult {
  if (end !== null && end.getTime() <= start.getTime()) {
    return "end_before_start";
  }
  return "ok";
}
