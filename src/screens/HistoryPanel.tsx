import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DiaperIcon, FeedIcon } from "../components/EventIcons";
import { FeedLog } from "../components/FeedLog";
import { DayTimeline, WeekTimeline } from "../components/DayTimeline";
import type { Baby, Diaper, Feed, RangeStats } from "../domain";
import { diaperLabel, es } from "../i18n/es";
import { formatMinutes, formatStat } from "../lib/format";
import { addCalendarDays, localDateRangeToUtc, todayLocalDate, toDatetimeLocalValue } from "../lib/localTime";
import { diapersChangedPerDay } from "../lib/computeRangeStats";
import { sideMinutesPerDay } from "../lib/daySummary";
import { bottleDaily } from "../lib/computeRangeStats";
import { assignSessionId, type DismissedPair } from "../lib/feedSessions";
import { messageForError } from "../lib/errors";

type HistoryPanelProps = {
  client: SupabaseClient;
  baby: Baby;
  timeZone: string;
};

export function HistoryPanel({ client, baby, timeZone }: HistoryPanelProps) {
  const today = todayLocalDate(timeZone);
  const from = baby.born_on && baby.born_on <= today ? baby.born_on : today;
  const [stats, setStats] = useState<RangeStats | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [diapers, setDiapers] = useState<Diaper[]>([]);
  const [dismissed, setDismissed] = useState<DismissedPair[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(today);
  const [tick, setTick] = useState(0);
  const dayCard = useRef<HTMLElement>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const range = localDateRangeToUtc(from, today, timeZone);
      const [statsResult, feedsResult, diapersResult, pairRows] = await Promise.all([
        client.rpc("range_stats", { p_baby_id: baby.id, p_from: from, p_to: today, p_tz: timeZone }),
        client
          .from("feeds")
          .select("id, household_id, baby_id, started_at, ended_at, paused_ms, paused_at, side, kind, ml, session_id")
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
        client.from("feed_pair_dismissals").select("earlier_feed_id, later_feed_id").eq("household_id", baby.household_id),
      ]);
      if (ignore) return;
      const failure = statsResult.error ?? feedsResult.error ?? diapersResult.error ?? pairRows.error;
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
      setDismissed((pairRows.data ?? []) as DismissedPair[]);
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [baby.id, client, from, timeZone, today, tick]);

  useEffect(() => {
    setSelectedDay(today);
  }, [baby.id, today]);

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

  const sides = sideMinutesPerDay(feeds, timeZone);
  const bottles = bottleDaily(feeds, timeZone);
  const selected = days.get(selectedDay) ?? { feeds: [], diapers: [] };

  function chooseDay(value: string) {
    setSelectedDay(clampDay(value, from, today));
    setSelectedIds(new Set());
  }

  function toggleSelected(ids: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function groupFeeds(chosen: Feed[]) {
    const sessionId = assignSessionId(chosen, () => crypto.randomUUID());
    if (!sessionId) return;
    setError(null);
    for (const feed of chosen) {
      if (feed.session_id === sessionId) continue;
      const { error: writeError } = await client.from("feeds").update({ session_id: sessionId }).eq("id", feed.id);
      if (writeError) {
        setError(messageForError(writeError));
        setTick((value) => value + 1);
        return;
      }
    }
    setSelectedIds(new Set());
    setTick((value) => value + 1);
  }

  async function ungroup(sessionId: string) {
    const { error: writeError } = await client.from("feeds").update({ session_id: null }).eq("session_id", sessionId).eq("baby_id", baby.id);
    if (writeError) setError(messageForError(writeError));
    setSelectedIds(new Set());
    setTick((value) => value + 1);
  }

  async function dismissPair(earlierId: string, laterId: string) {
    const { error: writeError } = await client.from("feed_pair_dismissals").insert({
      household_id: baby.household_id,
      earlier_feed_id: earlierId,
      later_feed_id: laterId,
    });
    if (writeError) setError(messageForError(writeError));
    setTick((value) => value + 1);
  }

  return (
    <div className="stack">
      <p className="muted">{baby.born_on && baby.born_on <= today ? es.historySpan : es.historyNeedsBirth}</p>
      {error ? <p className="error">{error}</p> : null}
      {stats ? (
        <section className="card stats">
          <Stat label={es.feedsPerDay} value={formatStat(stats.feeds_per_day)} />
          <Stat label={es.minutesPerFeed} value={formatMinutes(stats.minutes_per_feed)} />
          <Stat label={es.leftPerDay} value={formatMinutes(sides.left)} />
          <Stat label={es.rightPerDay} value={formatMinutes(sides.right)} />
          <Stat label={es.bottlesPerDay} value={formatStat(bottles.count)} />
          <Stat label={es.mlPerDay} value={bottles.ml === null ? null : `${formatStat(bottles.ml)} ${es.ml}`} />
          <Stat label={es.diapersPerDay} value={formatStat(diapersChangedPerDay(diapers, timeZone))} />
          <Stat label={es.peePerDay} value={formatStat(stats.pee_per_day)} />
          <Stat label={es.poopPerDay} value={formatStat(stats.poop_per_day)} />
          <Stat label={es.meanGap} value={formatMinutes(stats.mean_gap_minutes)} />
          <p className="muted">{es.statsNote}</p>
        </section>
      ) : null}
      {loading ? <p className="muted">{es.loading}</p> : null}
      <div className="day-picker">
        <button type="button" className="ghost" aria-label={es.previousDay} disabled={selectedDay <= from} onClick={() => chooseDay(addCalendarDays(selectedDay, -1))}>
          ‹
        </button>
        <input
          type="date"
          aria-label={es.chooseDay}
          min={from}
          max={today}
          value={selectedDay}
          onChange={(event) => chooseDay(event.target.value)}
        />
        <button type="button" className="ghost" aria-label={es.nextDay} disabled={selectedDay >= today} onClick={() => chooseDay(addCalendarDays(selectedDay, 1))}>
          ›
        </button>
      </div>
      <section className="card stack" ref={dayCard}>
        <h2>{selectedDay}</h2>
        <DayTimeline feeds={selected.feeds} diapers={selected.diapers} timeZone={timeZone} />
          <div className="stack">
            <h3 className="section-title">
              <FeedIcon />
              {es.feedsHeading}
            </h3>
            {selected.feeds.length === 0 ? <p className="muted">{es.noFeedsYet}</p> : null}
            <FeedLog
              plain
              feeds={selected.feeds}
              dismissed={dismissed}
              timeZone={timeZone}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
              onGroup={(chosen) => void groupFeeds(chosen)}
              onUngroup={(sessionId) => void ungroup(sessionId)}
              onDismiss={(earlierId, laterId) => void dismissPair(earlierId, laterId)}
            />
          </div>
          <div className="stack">
            <h3 className="section-title">
              <DiaperIcon />
              {es.diapersHeading}
            </h3>
            {selected.diapers.length === 0 ? <p className="muted">{es.noDiapersYet}</p> : null}
            <ul className="entries plain">
              {selected.diapers.map((diaper) => (
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
      <WeekTimeline
        timeZone={timeZone}
        selectedDay={selectedDay}
        onSelectDay={(day) => {
          chooseDay(day);
          dayCard.current?.scrollIntoView({ block: "start" });
        }}
        days={[...days.entries()]
          .filter(([day]) => day >= addCalendarDays(today, -6))
          .sort((left, right) => right[0].localeCompare(left[0]))
          .map(([day, bucket]) => ({ day, feeds: bucket.feeds, diapers: bucket.diapers }))}
      />
    </div>
  );
}

function clampDay(value: string, earliest: string, latest: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return latest;
  if (value < earliest) return earliest;
  if (value > latest) return latest;
  return value;
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="stat-line">
      <span className="muted">{label}</span>
      <strong>{value ?? es.noData}</strong>
    </p>
  );
}
