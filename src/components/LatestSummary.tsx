import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaperKind, FeedSide } from "../domain";
import { DiaperIcon, FeedIcon } from "./EventIcons";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { formatLatestFeedLine, formatLatestStamp } from "../lib/latestStamp";

type LatestSummaryProps = {
  client: SupabaseClient;
  babyId: string;
  timeZone: string;
  refreshKey: number;
};

type LatestFeed = {
  id: string;
  started_at: string;
  ended_at: string | null;
  paused_ms: number;
  paused_at: string | null;
  side: FeedSide;
};

type LatestDiaper = {
  id: string;
  occurred_at: string;
  kind: DiaperKind;
};

const feedColumns = "id, started_at, ended_at, paused_ms, paused_at, side";
const diaperColumns = "id, occurred_at, kind";

export function LatestSummary({ client, babyId, timeZone, refreshKey }: LatestSummaryProps) {
  const [feed, setFeed] = useState<LatestFeed | null>(null);
  const [diaper, setDiaper] = useState<LatestDiaper | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFeed(null);
    setDiaper(null);
    setReady(false);
    setError(null);
  }, [babyId]);

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
      setFeed((feedResult.data ?? null) as LatestFeed | null);
      setDiaper((diaperResult.data ?? null) as LatestDiaper | null);
      setReady(true);
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
  }, [babyId, client, refreshKey, timeZone]);

  return (
    <section className="latest">
      <article className="card">
        <div className="entry-line">
          <FeedIcon />
          <h2>{es.latestFeed}</h2>
        </div>
        {ready && feed ? <p>{sideLabel(feed.side)}</p> : null}
        <p className="muted">
          {!ready
            ? es.loading
            : feed
              ? formatLatestFeedLine(
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
