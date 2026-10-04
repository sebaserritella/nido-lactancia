export type FeedIntervalResult = "ok" | "end_before_start";

export function validateFeedInterval(start: Date, end: Date | null): FeedIntervalResult {
  if (end !== null && end.getTime() <= start.getTime()) {
    return "end_before_start";
  }
  return "ok";
}
