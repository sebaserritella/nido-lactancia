import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DiaperIcon, FeedIcon } from "../components/EventIcons";
import type { Baby, Diaper, Feed, RangeStats } from "../domain";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import { formatMinutes, formatStat } from "../lib/format";
import { addCalendarDays, localDateRangeToUtc, todayLocalDate, toDatetimeLocalValue } from "../lib/localTime";
import { messageForError } from "../lib/errors";

type HistoryPanelProps = {
  client: SupabaseClient;
  baby: Baby;
  timeZone: string;
};

export function HistoryPanel({ client, baby, timeZone }: HistoryPanelProps) {
  const today = todayLocalDate(timeZone);
  const [from, setFrom] = useState(() => addCalendarDays(today, -6));
  const [to, setTo] = useState(today);
  const [stats, setStats] = useState<RangeStats | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [diapers, setDiapers] = useState<Diaper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (from > to) {
      setError(es.invalidRange);
      setStats(null);
      setLoading(false);
      return;
    }
    let ignore = false;
    async function load() {
      const range = localDateRangeToUtc(from, to, timeZone);
      const [statsResult, feedsResult, diapersResult] = await Promise.all([
        client.rpc("range_stats", { p_baby_id: baby.id, p_from: from, p_to: to, p_tz: timeZone }),
        client
          .from("feeds")
          .select("id, household_id, baby_id, started_at, ended_at, side")
          .eq("baby_id", baby.id)
          .gte("started_at", range.startInclusive.toISOString())
          .lt("started_at", range.endExclusive.toISOString())
          .order("started_at", { ascending: false }),
        client
          .from("diapers")
          .select("id, household_id, baby_id, occurred_at, kind")
          .eq("baby_id", baby.id)
          .gte("occurred_at", range.startInclusive.toISOString())
          .lt("occurred_at", range.endExclusive.toISOString())
          .order("occurred_at", { ascending: false }),
      ]);
      if (ignore) return;
      const failure = statsResult.error ?? feedsResult.error ?? diapersResult.error;
      if (failure) {
        setError(messageForError(failure));
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(false);
      setStats(statsResult.data as RangeStats);
      setFeeds((feedsResult.data ?? []) as Feed[]);
      setDiapers((diapersResult.data ?? []) as Diaper[]);
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [baby.id, client, from, timeZone, to]);

  const days = new Map<string, { feeds: Feed[]; diapers: Diaper[] }>();
  for (const feed of feeds) {
    const day = todayLocalDate(timeZone, new Date(feed.started_at));
    const bucket = days.get(day) ?? { feeds: [], diapers: [] };
    bucket.feeds.push(feed);
    days.set(day, bucket);
  }
  for (const diaper of diapers) {
    const day = todayLocalDate(timeZone, new Date(diaper.occurred_at));
    const bucket = days.get(day) ?? { feeds: [], diapers: [] };
    bucket.diapers.push(diaper);
    days.set(day, bucket);
  }

  return (
    <div className="stack">
      <section className="card dates">
        <label>
          {es.from}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          {es.to}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>
      {error ? <p className="error">{error}</p> : null}
      {stats ? (
        <section className="card stats">
          <Stat label={es.feedsPerDay} value={formatStat(stats.feeds_per_day)} />
          <Stat label={es.minutesPerFeed} value={formatMinutes(stats.minutes_per_feed)} />
          <Stat label={es.peePerDay} value={formatStat(stats.pee_per_day)} />
          <Stat label={es.poopPerDay} value={formatStat(stats.poop_per_day)} />
          <Stat label={es.bothPerDay} value={formatStat(stats.both_diapers_per_day)} />
          <Stat label={es.meanGap} value={formatMinutes(stats.mean_gap_minutes)} />
          <p className="muted">{es.statsNote}</p>
        </section>
      ) : null}
      {loading ? <p className="muted">{es.loading}</p> : null}
      {days.size === 0 && !error && !loading ? <p className="muted">{es.emptyRange}</p> : null}
      {[...days.entries()]
        .sort((left, right) => right[0].localeCompare(left[0]))
        .map(([day, bucket]) => (
        <section key={day} className="card stack">
          <h2>{day}</h2>
          <div className="stack">
            <h3 className="section-title">
              <FeedIcon />
              {es.feedsHeading}
            </h3>
            {bucket.feeds.length === 0 ? <p className="muted">{es.noFeedsYet}</p> : null}
            <ul className="entries plain">
              {bucket.feeds.map((feed) => (
                <li key={feed.id}>
                  <div className="entry-line">
                    <FeedIcon />
                    <div className="entry-copy">
                      <strong>
                        {toDatetimeLocalValue(feed.started_at, timeZone).slice(11)}
                        {feed.ended_at ? `–${toDatetimeLocalValue(feed.ended_at, timeZone).slice(11)}` : ` · ${es.inProgress}`}
                      </strong>
                      <span>{sideLabel(feed.side)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="stack">
            <h3 className="section-title">
              <DiaperIcon />
              {es.diapersHeading}
            </h3>
            {bucket.diapers.length === 0 ? <p className="muted">{es.noDiapersYet}</p> : null}
            <ul className="entries plain">
              {bucket.diapers.map((diaper) => (
                <li key={diaper.id}>
                  <div className="entry-line">
                    <DiaperIcon />
                    <div className="entry-copy">
                      <strong>{toDatetimeLocalValue(diaper.occurred_at, timeZone).slice(11)}</strong>
                      <span>{diaperLabel(diaper.kind)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <p>
      <span className="muted">{label}</span>
      <strong>{value ?? es.noData}</strong>
    </p>
  );
}
