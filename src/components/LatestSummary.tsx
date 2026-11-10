import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DiaperIcon, FeedIcon } from "./EventIcons";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { formatMinutes } from "../lib/format";
import { formatLatestStamp } from "../lib/latestStamp";
import { activeMinutes } from "../lib/feedDuration";
import { latestToma, nextSide as nextSideFrom } from "../lib/latestToma";
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

const feedColumns = "id, started_at, ended_at, paused_ms, paused_at, side, kind, ml, session_id";
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
    session_id: feed.session_id ?? null,
  };
}

function normalizeDiaper(value: unknown): LatestDiaper | null {
  if (!value || typeof value !== "object") return null;
  const diaper = value as LatestDiaper;
  if (diaper.kind !== "pee" && diaper.kind !== "poop" && diaper.kind !== "both") return null;
  return { id: diaper.id, occurred_at: diaper.occurred_at, kind: diaper.kind };
}

function cachedLatest(
  userId: string,
  babyId: string,
): {
  feed: LatestFeed | null;
  session: LatestFeed[];
  nextSide: "left" | "right" | null;
  diaper: LatestDiaper | null;
  ready: boolean;
} {
  const entry = readResume(localStorage, userId)?.latest[babyId];
  if (!entry) return { feed: null, session: [], nextSide: null, diaper: null, ready: false };
  return { feed: entry.feed, session: entry.session ?? [], nextSide: entry.nextSide ?? null, diaper: entry.diaper, ready: true };
}

export function LatestSummary({ client, userId, babyId, timeZone, refreshKey }: LatestSummaryProps) {
  const [feed, setFeed] = useState<LatestFeed | null>(() => cachedLatest(userId, babyId).feed);
  const [session, setSession] = useState<LatestFeed[]>(() => cachedLatest(userId, babyId).session);
  const [nextSide, setNextSide] = useState<"left" | "right" | null>(() => cachedLatest(userId, babyId).nextSide);
  const [diaper, setDiaper] = useState<LatestDiaper | null>(() => cachedLatest(userId, babyId).diaper);
  const [ready, setReady] = useState(() => cachedLatest(userId, babyId).ready);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = cachedLatest(userId, babyId);
    setFeed(cached.feed);
    setSession(cached.session);
    setNextSide(cached.nextSide);
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
          .limit(20),
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
      const recent = ((feedResult.data ?? []) as unknown[]).map(normalizeFeed).filter((row): row is LatestFeed => row !== null);
      const nextFeed = recent[0] ?? null;
      const upcomingSide = nextSideFrom(recent);
      let nextSession: LatestFeed[] = [];
      if (nextFeed?.session_id) {
        const sessionResult = await client
          .from("feeds")
          .select(feedColumns)
          .eq("baby_id", babyId)
          .eq("session_id", nextFeed.session_id)
          .order("started_at", { ascending: true });
        if (ignore || current !== request) return;
        if (!sessionResult.error) {
          const rows = ((sessionResult.data ?? []) as unknown[]).map(normalizeFeed).filter((row): row is LatestFeed => row !== null);
          if (rows.length > 1) nextSession = rows;
        }
      }
      setError(null);
      const nextDiaper = normalizeDiaper(diaperResult.data);
      setFeed(nextFeed);
      setSession(nextSession);
      setNextSide(upcomingSide);
      setDiaper(nextDiaper);
      setReady(true);
      rememberLatest(localStorage, userId, babyId, {
        feed: nextFeed,
        diaper: nextDiaper,
        ...(nextSession.length > 1 ? { session: nextSession } : {}),
        nextSide: upcomingSide,
      });
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

  const toma = feed && feed.kind !== "bottle" && session.length > 1 ? latestToma(session) : null;
  const feedView = describeFeed(feed, toma, timeZone);

  return (
    <section className="latest">
      <article className="card">
        <div className="entry-line">
          <FeedIcon />
          <h2>{es.latestFeed}</h2>
        </div>
        {!ready ? (
          <p className="latest-sub">{es.loading}</p>
        ) : feedView ? (
          <>
            <p className="latest-main">{feedView.main}</p>
            <p className="latest-sub">{feedView.sub}</p>
            {toma || nextSide ? (
              <div className="chips">
                {toma ? <span className="chip">{es.groupedFeed(toma.count)}</span> : null}
                {nextSide ? <span className="chip accent">{es.nextSide(sideLabel(nextSide))}</span> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="latest-sub">{es.noFeedsYet}</p>
        )}
      </article>
      <article className="card">
        <div className="entry-line">
          <DiaperIcon />
          <h2>{es.latestDiaper}</h2>
        </div>
        {!ready ? (
          <p className="latest-sub">{es.loading}</p>
        ) : diaper ? (
          <>
            <p className="latest-main">{formatLatestStamp(diaper.occurred_at, timeZone)}</p>
            <p className="latest-sub">{diaperLabel(diaper.kind)}</p>
          </>
        ) : (
          <p className="latest-sub">{es.noDiapersYet}</p>
        )}
      </article>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

/** Main line (when) and detail line (what and how long) for the latest feed or grouped toma. */
function describeFeed(
  feed: LatestFeed | null,
  toma: ReturnType<typeof latestToma>,
  timeZone: string,
): { main: string; sub: string } | null {
  if (!feed) return null;
  if (toma) {
    const main = toma.endedAt === null ? (toma.paused ? es.paused : es.inProgress) : formatLatestStamp(toma.endedAt, timeZone);
    const sides = toma.sides.map(sideLabel).join(" + ");
    return { main, sub: `${sides} · ${es.totalTime(formatMinutes(toma.minutes) ?? "0 min")}` };
  }
  if (feed.kind === "bottle") {
    return { main: formatLatestStamp(feed.started_at, timeZone), sub: `${es.bottle} · ${feed.ml ?? 0} ${es.ml}` };
  }
  const side = feed.side ? sideLabel(feed.side) : "";
  if (feed.ended_at === null) {
    return { main: feed.paused_at ? es.paused : es.inProgress, sub: side };
  }
  const minutes = formatMinutes(activeMinutes({ started_at: feed.started_at, ended_at: feed.ended_at, paused_ms: feed.paused_ms ?? 0 }));
  return { main: formatLatestStamp(feed.ended_at, timeZone), sub: [side, minutes].filter(Boolean).join(" · ") };
}
