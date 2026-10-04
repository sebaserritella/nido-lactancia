export type FeedClock = {
  started_at: string;
  ended_at: string | null;
  paused_ms?: number | null;
  paused_at?: string | null;
};

/** Feeding time, excluding pauses. An open pause stays frozen at the moment it started. */
export function activeElapsedMs(feed: FeedClock, now = Date.now()): number {
  const start = new Date(feed.started_at).getTime();
  const end = feed.ended_at == null ? now : new Date(feed.ended_at).getTime();
  let paused = feed.paused_ms ?? 0;
  if (feed.ended_at == null && feed.paused_at) {
    paused += Math.max(0, now - new Date(feed.paused_at).getTime());
  }
  return Math.max(0, end - start - paused);
}

export function activeMinutes(feed: FeedClock, now = Date.now()): number {
  return activeElapsedMs(feed, now) / 60_000;
}

/** Add the current pause, if any, into the accumulated total and clear it. */
export function closePause(feed: FeedClock, now = Date.now()): { paused_ms: number; paused_at: null } {
  const extra = feed.paused_at ? Math.max(0, now - new Date(feed.paused_at).getTime()) : 0;
  return { paused_ms: (feed.paused_ms ?? 0) + extra, paused_at: null };
}
