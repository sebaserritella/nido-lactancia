import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DiaperIcon, FeedIcon } from "./EventIcons";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { formatLatestFeedLine, formatLatestStamp } from "../lib/latestStamp";
import { readResume, rememberLatest, type CachedDiaper, type CachedFeed } from "../lib/resume";

type LatestSummaryProps = {
  client: SupabaseClient;
  userId: string;
  babyId: string;
  timeZone: string;
  refreshKey: number;
};

type LatestFeed = CachedFeed;
type LatestDiaper = CachedDiaper;

const feedColumns = "id, started_at, ended_at, paused_ms, paused_at, side, kind, ml";
const diaperColumns = "id, occurred_at, kind";

function normalizeFeed(value: unknown): LatestFeed | null {
  if (!value || typeof value !== "object") return null;
  const feed = value as LatestFeed;
  if (feed.kind !== "breast" && feed.kind !== "bottle") return null;
  if (feed.side !== null && feed.side !== "left" && feed.side !== "right" && feed.side !== "both") return null;
  return {
    id: feed.id,
    started_at: feed.started_at,
    ended_at: feed.ended_at ?? null,
    paused_ms: feed.paused_ms ?? 0,
    paused_at: feed.paused_at ?? null,
    side: feed.side ?? null,
    kind: feed.kind,
    ml: feed.ml ?? null,
  };
}

function normalizeDiaper(value: unknown): LatestDiaper | null {
  if (!value || typeof value !== "object") return null;
  const diaper = value as LatestDiaper;
  if (diaper.kind !== "pee" && diaper.kind !== "poop" && diaper.kind !== "both") return null;
  return { id: diaper.id, occurred_at: diaper.occurred_at, kind: diaper.kind };
}

function cachedLatest(userId: string, babyId: string): { feed: LatestFeed | null; diaper: LatestDiaper | null; ready: boolean } {
  const entry = readResume(localStorage, userId)?.latest[babyId];
  if (!entry) return { feed: null, diaper: null, ready: false };
  return { feed: entry.feed, diaper: entry.diaper, ready: true };
}

export function LatestSummary({ client, userId, babyId, timeZone, refreshKey }: LatestSummaryProps) {
  const [feed, setFeed] = useState<LatestFeed | null>(() => cachedLatest(userId, babyId).feed);
  const [diaper, setDiaper] = useState<LatestDiaper | null>(() => cachedLatest(userId, babyId).diaper);
  const [ready, setReady] = useState(() => cachedLatest(userId, babyId).ready);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = cachedLatest(userId, babyId);
    setFeed(cached.feed);
    setDiaper(cached.diaper);
    setReady(cached.ready);
    setError(null);
  }, [babyId, userId]);

  useEffect(() => {
    let ignore = false;
    let request = 0;
    async function load() {
      const current = ++request;
      const [feedResult, diaperResult] = await Promise.all([
        client
          .from("feeds")
          .select(feedColumns)
          .eq("baby_id", babyId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from("diapers")
          .select(diaperColumns)
          .eq("baby_id", babyId)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (ignore || current !== request) return;
      const failure = feedResult.error ?? diaperResult.error;
      if (failure) {
        setError(messageForError(failure));
        setReady(true);
        return;
      }
      setError(null);
      const nextFeed = normalizeFeed(feedResult.data);
      const nextDiaper = normalizeDiaper(diaperResult.data);
      setFeed(nextFeed);
      setDiaper(nextDiaper);
      setReady(true);
      rememberLatest(localStorage, userId, babyId, { feed: nextFeed, diaper: nextDiaper });
    }
    void load();
    const channel = client
      .channel(`latest-${babyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feeds", filter: `baby_id=eq.${babyId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "diapers", filter: `baby_id=eq.${babyId}` }, () => void load())
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [babyId, client, refreshKey, timeZone, userId]);

  return (
    <section className="latest">
      <article className="card">
        <div className="entry-line">
          <FeedIcon />
          <h2>{es.latestFeed}</h2>
        </div>
        {ready && feed ? <p>{feed.kind === "bottle" ? es.bottle : feed.side ? sideLabel(feed.side) : ""}</p> : null}
        <p className="muted">
          {!ready
            ? es.loading
            : feed
              ? feed.kind === "bottle"
                ? `${formatLatestStamp(feed.started_at, timeZone)} · ${feed.ml} ${es.ml}`
                : formatLatestFeedLine(
                    feed.started_at,
                    feed.ended_at,
                    timeZone,
                    feed.paused_at ? es.paused : es.inProgress,
                    new Date(),
                    feed.paused_ms ?? 0,
                  )
              : es.noFeedsYet}
        </p>
      </article>
      <article className="card">
        <div className="entry-line">
          <DiaperIcon />
          <h2>{es.latestDiaper}</h2>
        </div>
        {ready && diaper ? <p>{diaperLabel(diaper.kind)}</p> : null}
        <p className="muted">{!ready ? es.loading : diaper ? formatLatestStamp(diaper.occurred_at, timeZone) : es.noDiapersYet}</p>
      </article>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
