export const sameFeedIdleMinutes = 15;

const idleLimitMs = sameFeedIdleMinutes * 60 * 1000;

export type SessionFeed = {
  id: string;
  baby_id?: string;
  started_at: string;
  ended_at: string | null;
  side: "left" | "right" | "both" | null;
  kind?: "breast" | "bottle";
  session_id?: string | null;
};

export type DismissedPair = {
  earlier_feed_id: string;
  later_feed_id: string;
};

export type FeedBlock<T extends SessionFeed> =
  | { kind: "feed"; feed: T }
  | { kind: "group"; sessionId: string; feeds: T[] }
  | { kind: "suggestion"; earlier: T; later: T; idleMinutes: number };

/** One clock start per toma. A group uses its earliest start. */
export function intakeStarts(feeds: { id?: string; session_id?: string | null; started_at: string }[]): number[] {
  const bySession = new Map<string, number>();
  feeds.forEach((feed, index) => {
    const key = sessionKey(feed, index);
    const start = new Date(feed.started_at).getTime();
    const current = bySession.get(key);
    if (current === undefined || start < current) bySession.set(key, start);
  });
  return [...bySession.values()].sort((left, right) => left - right);
}

export function sessionKey(feed: { id?: string; session_id?: string | null }, index: number): string {
  if (feed.session_id) return `session:${feed.session_id}`;
  if (feed.id) return `feed:${feed.id}`;
  return `row:${index}`;
}

export function feedBlocks<T extends SessionFeed>(feeds: T[], dismissed: DismissedPair[]): FeedBlock<T>[] {
  const sorted = [...feeds].sort((left, right) => right.started_at.localeCompare(left.started_at));
  const seen = new Set<string>();
  const blocks: FeedBlock<T>[] = [];
  for (const feed of sorted) {
    if (seen.has(feed.id)) continue;
    const members = feed.session_id ? sorted.filter((item) => item.session_id === feed.session_id) : [feed];
    for (const member of members) seen.add(member.id);
    if (members.length > 1 && feed.session_id) {
      blocks.push({
        kind: "group",
        sessionId: feed.session_id,
        feeds: [...members].sort((left, right) => left.started_at.localeCompare(right.started_at)),
      });
    } else {
      blocks.push({ kind: "feed", feed });
    }
  }
  const withSuggestions: FeedBlock<T>[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    withSuggestions.push(blocks[index]);
    const newer = blocks[index];
    const older = blocks[index + 1];
    if (newer?.kind !== "feed" || older?.kind !== "feed") continue;
    const suggestion = suggestionFor(older.feed, newer.feed, dismissed);
    if (suggestion) withSuggestions.push(suggestion);
  }
  return withSuggestions;
}

export function groupableFeeds<T extends SessionFeed>(feeds: T[], selectedIds: ReadonlySet<string>): T[] {
  return feeds.filter((feed) => selectedIds.has(feed.id) && isBreast(feed));
}

export function assignSessionId(feeds: { session_id?: string | null }[], createId: () => string): string | null {
  if (feeds.length < 2) return null;
  return feeds.find((feed) => feed.session_id)?.session_id ?? createId();
}

/** How many tomas the selection still is. Rows that already share a session count once. */
export function tomaCount(feeds: { id: string; session_id?: string | null }[]): number {
  return new Set(feeds.map((feed) => feed.session_id ?? feed.id)).size;
}

function suggestionFor<T extends SessionFeed>(earlier: T, later: T, dismissed: DismissedPair[]): FeedBlock<T> | null {
  if (!isBreast(earlier) || !isBreast(later) || earlier.ended_at === null) return null;
  if (earlier.baby_id && later.baby_id && earlier.baby_id !== later.baby_id) return null;
  if (dismissed.some((pair) => pair.earlier_feed_id === earlier.id && pair.later_feed_id === later.id)) return null;
  const idleMs = new Date(later.started_at).getTime() - new Date(earlier.ended_at).getTime();
  if (idleMs < 0 || idleMs > idleLimitMs) return null;
  return { kind: "suggestion", earlier, later, idleMinutes: Math.round(idleMs / 60_000) };
}

function isBreast(feed: SessionFeed): boolean {
  return feed.kind !== "bottle" && feed.side !== null;
}
