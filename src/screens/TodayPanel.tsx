import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LatestSummary } from "../components/LatestSummary";
import { DiaperIcon, FeedIcon } from "../components/EventIcons";
import type { Baby } from "../domain";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import type { Diaper, DiaperKind, Feed, FeedSide } from "../domain";
import { messageForError } from "../lib/errors";
import { activeElapsedMs, activeMinutes, closePause } from "../lib/feedDuration";
import { summarizeDay } from "../lib/daySummary";
import { formatElapsed, formatMinutes, formatStat } from "../lib/format";
import { validateFeedInterval } from "../lib/feedRules";
import { localDateRangeToUtc, todayLocalDate, toDatetimeLocalValue, zonedTimeToUtc } from "../lib/localTime";
import { WeightSection } from "./WeightSection";

type TodayPanelProps = {
  client: SupabaseClient;
  baby: Baby;
  userId: string;
  timeZone: string;
};

const feedColumns = "id, household_id, baby_id, started_at, ended_at, paused_ms, paused_at, side";
const diaperColumns = "id, household_id, baby_id, occurred_at, kind";

export function TodayPanel({ client, baby, userId, timeZone }: TodayPanelProps) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [diapers, setDiapers] = useState<Diaper[]>([]);
  const [side, setSide] = useState<FeedSide>("left");
  const [error, setError] = useState<string | null>(null);
  const [backfill, setBackfill] = useState(false);
  const [diaperBackfill, setDiaperBackfill] = useState(false);
  const [editing, setEditing] = useState<Feed | null>(null);
  const [editingDiaper, setEditingDiaper] = useState<Diaper | null>(null);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [action, setAction] = useState<"feed" | "diaper">("feed");

  const open = feeds.find((feed) => feed.ended_at === null) ?? null;

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const today = todayLocalDate(timeZone);
      const range = localDateRangeToUtc(today, today, timeZone);
      const [dayFeeds, dayDiapers, openFeed] = await Promise.all([
        client
          .from("feeds")
          .select(feedColumns)
          .eq("baby_id", baby.id)
          .gte("started_at", range.startInclusive.toISOString())
          .lt("started_at", range.endExclusive.toISOString())
          .order("started_at", { ascending: false }),
        client
          .from("diapers")
          .select(diaperColumns)
          .eq("baby_id", baby.id)
          .gte("occurred_at", range.startInclusive.toISOString())
          .lt("occurred_at", range.endExclusive.toISOString())
          .order("occurred_at", { ascending: false }),
        client.from("feeds").select(feedColumns).eq("baby_id", baby.id).is("ended_at", null).maybeSingle(),
      ]);
      if (ignore) return;
      const failure = dayFeeds.error ?? dayDiapers.error ?? openFeed.error;
      if (failure) {
        setError(messageForError(failure));
        return;
      }
      const merged = [...((dayFeeds.data ?? []) as Feed[])];
      const running = openFeed.data as Feed | null;
      if (running && !merged.some((feed) => feed.id === running.id)) {
        merged.unshift(running);
      }
      setFeeds(merged);
      setDiapers((dayDiapers.data ?? []) as Diaper[]);
    }
    void load();
    const channel = client
      .channel(`today-${baby.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feeds", filter: `baby_id=eq.${baby.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "diapers", filter: `baby_id=eq.${baby.id}` }, () => void load())
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [baby.id, client, tick, timeZone]);

  async function run(action: () => PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<boolean> {
    setError(null);
    const { error: writeError } = await action();
    if (writeError) {
      setError(messageForError(writeError));
      return false;
    }
    setTick((value) => value + 1);
    return true;
  }

  async function startFeed() {
    await run(() =>
      client.from("feeds").insert({
        household_id: baby.household_id,
        baby_id: baby.id,
        started_at: new Date().toISOString(),
        side,
        created_by: userId,
      }),
    );
  }

  async function pauseFeed() {
    if (!open || open.paused_at) return;
    await run(() => client.from("feeds").update({ paused_at: new Date().toISOString() }).eq("id", open.id));
  }

  async function resumeFeed() {
    if (!open?.paused_at) return;
    const now = Date.now();
    await run(() => client.from("feeds").update(closePause(open, now)).eq("id", open.id));
  }

  async function stopFeed() {
    if (!open) return;
    const now = Date.now();
    await run(() =>
      client.from("feeds").update({ ...closePause(open, now), ended_at: new Date(now).toISOString() }).eq("id", open.id),
    );
  }

  async function logDiaper(kind: DiaperKind) {
    await run(() =>
      client.from("diapers").insert({
        household_id: baby.household_id,
        baby_id: baby.id,
        occurred_at: new Date().toISOString(),
        kind,
        created_by: userId,
      }),
    );
  }

  async function saveFeed(startLocal: string, endLocal: string, nextSide: FeedSide, feedId?: string) {
    const start = zonedTimeToUtc(startLocal, timeZone);
    const end = endLocal === "" ? null : zonedTimeToUtc(endLocal, timeZone);
    if (validateFeedInterval(start, end) !== "ok") {
      setError(messageForError({ code: "23514" }));
      return;
    }
    const payload = { started_at: start.toISOString(), ended_at: end?.toISOString() ?? null, side: nextSide };
    const ok = feedId
      ? await run(() => client.from("feeds").update(payload).eq("id", feedId))
      : await run(() =>
          client.from("feeds").insert({
            ...payload,
            household_id: baby.household_id,
            baby_id: baby.id,
            created_by: userId,
          }),
        );
    if (!ok) return;
    setBackfill(false);
    setEditing(null);
  }

  async function saveDiaper(id: string, local: string, kind: DiaperKind) {
    const ok = await run(() =>
      client.from("diapers").update({ occurred_at: zonedTimeToUtc(local, timeZone).toISOString(), kind }).eq("id", id),
    );
    if (ok) setEditingDiaper(null);
  }

  async function savePastDiaper(local: string, kind: DiaperKind) {
    if (local === "") return;
    const ok = await run(() =>
      client.from("diapers").insert({
        household_id: baby.household_id,
        baby_id: baby.id,
        occurred_at: zonedTimeToUtc(local, timeZone).toISOString(),
        kind,
        created_by: userId,
      }),
    );
    if (ok) setDiaperBackfill(false);
  }

  async function removeFeed(id: string) {
    if (!window.confirm(es.confirmDeleteFeed)) return;
    await run(() => client.from("feeds").delete().eq("id", id));
  }

  async function removeDiaper(id: string) {
    if (!window.confirm(es.confirmDeleteDiaper)) return;
    await run(() => client.from("diapers").delete().eq("id", id));
  }

  const today = todayLocalDate(timeZone);

  return (
    <div className="stack">
      <LatestSummary client={client} babyId={baby.id} timeZone={timeZone} refreshKey={tick} />
      <div className="segment" role="group" aria-label={es.logMode}>
        <button type="button" aria-pressed={action === "feed"} className={action === "feed" ? "selected with-icon" : "ghost with-icon"} onClick={() => setAction("feed")}>
          <FeedIcon />
          {es.logFeed}
        </button>
        <button
          type="button"
          aria-pressed={action === "diaper"}
          className={action === "diaper" ? "selected with-icon" : "ghost with-icon"}
          onClick={() => setAction("diaper")}
        >
          <DiaperIcon />
          {es.logDiaper}
        </button>
      </div>
      <section className="card stack">
        {action === "feed" ? (
          <>
            {open ? (
              <>
                <p className="timer">{formatElapsed(activeElapsedMs(open, now))}</p>
                <p className="muted">
                  {todayLocalDate(timeZone, new Date(open.started_at)) === today
                    ? `${open.paused_at ? es.paused : es.inProgress} · ${sideLabel(open.side)}`
                    : open.paused_at
                      ? `${es.paused} · ${todayLocalDate(timeZone, new Date(open.started_at))} ${toDatetimeLocalValue(open.started_at, timeZone).slice(11)}`
                      : es.inProgressSince(
                          `${todayLocalDate(timeZone, new Date(open.started_at))} ${toDatetimeLocalValue(open.started_at, timeZone).slice(11)}`,
                        )}
                </p>
                <div className="choice">
                  {open.paused_at ? (
                    <button type="button" onClick={resumeFeed}>
                      {es.resume}
                    </button>
                  ) : (
                    <button type="button" className="ghost" onClick={pauseFeed}>
                      {es.pause}
                    </button>
                  )}
                  <button type="button" onClick={stopFeed}>
                    {es.ended}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="choice">
                  {(["left", "right", "both"] as FeedSide[]).map((value) => (
                    <button key={value} type="button" className={side === value ? "selected" : "ghost"} onClick={() => setSide(value)}>
                      {sideLabel(value)}
                    </button>
                  ))}
                </div>
                <button type="button" className="with-icon" onClick={startFeed}>
                  <FeedIcon />
                  {es.started}
                </button>
              </>
            )}
            <button type="button" className="ghost" onClick={() => setBackfill((value) => !value)}>
              {es.backfill}
            </button>
            {backfill ? (
              <FeedForm
                requireEnd
                initialStart=""
                initialEnd=""
                initialSide="left"
                onCancel={() => setBackfill(false)}
                onSave={(startLocal, endLocal, nextSide) => saveFeed(startLocal, endLocal, nextSide)}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="choice">
              {(["pee", "poop", "both"] as DiaperKind[]).map((kind) => (
                <button key={kind} type="button" className="ghost with-icon" onClick={() => logDiaper(kind)}>
                  <DiaperIcon />
                  {diaperLabel(kind)}
                </button>
              ))}
            </div>
            <button type="button" className="ghost" onClick={() => setDiaperBackfill((value) => !value)}>
              {es.backfillDiaper}
            </button>
            {diaperBackfill ? (
              <DiaperForm
                initialWhen=""
                initialKind="pee"
                onCancel={() => setDiaperBackfill(false)}
                onSave={(local, kind) => savePastDiaper(local, kind)}
              />
            ) : null}
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
      </section>
      <DaySummary feeds={feeds} diapers={diapers} />
      <section className="stack">
        <h2 className="section-title">
          <FeedIcon />
          {es.feedsHeading}
        </h2>
        {feeds.length === 0 ? <p className="muted">{es.noFeedsYet}</p> : null}
        <ul className="entries">
          {feeds.map((feed) => (
            <li key={feed.id}>
              <div className="entry-line">
                <FeedIcon />
                <div className="entry-copy">
                  <strong>
                    {toDatetimeLocalValue(feed.started_at, timeZone).slice(11)}
                    {feed.ended_at ? `–${toDatetimeLocalValue(feed.ended_at, timeZone).slice(11)}` : ""}
                  </strong>
                  <span>
                    {sideLabel(feed.side)}
                    {feed.ended_at
                      ? ` · ${formatMinutes(activeMinutes(feed))}`
                      : ` · ${feed.paused_at ? es.paused : es.inProgress}`}
                  </span>
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => setEditing(feed)}>
                  {es.editFeed}
                </button>
                <button type="button" className="ghost" onClick={() => removeFeed(feed.id)}>
                  {es.deleteFeed}
                </button>
              </div>
              {editing?.id === feed.id ? (
                <FeedForm
                  requireEnd={false}
                  initialStart={toDatetimeLocalValue(feed.started_at, timeZone)}
                  initialEnd={feed.ended_at ? toDatetimeLocalValue(feed.ended_at, timeZone) : ""}
                  initialSide={feed.side}
                  onCancel={() => setEditing(null)}
                  onSave={(startLocal, endLocal, nextSide) => saveFeed(startLocal, endLocal, nextSide, feed.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="stack">
        <h2 className="section-title">
          <DiaperIcon />
          {es.diapersHeading}
        </h2>
        {diapers.length === 0 ? <p className="muted">{es.noDiapersYet}</p> : null}
        <ul className="entries">
          {diapers.map((diaper) => (
            <li key={diaper.id}>
              <div className="entry-line">
                <DiaperIcon />
                <div className="entry-copy">
                  <strong>{toDatetimeLocalValue(diaper.occurred_at, timeZone).slice(11)}</strong>
                  <span>{diaperLabel(diaper.kind)}</span>
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => setEditingDiaper(diaper)}>
                  {es.editDiaper}
                </button>
                <button type="button" className="ghost" onClick={() => removeDiaper(diaper.id)}>
                  {es.deleteDiaper}
                </button>
              </div>
              {editingDiaper?.id === diaper.id ? (
                <DiaperForm
                  initialWhen={toDatetimeLocalValue(diaper.occurred_at, timeZone)}
                  initialKind={diaper.kind}
                  onCancel={() => setEditingDiaper(null)}
                  onSave={(local, kind) => saveDiaper(diaper.id, local, kind)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <WeightSection client={client} baby={baby} timeZone={timeZone} />
    </div>
  );
}

function DaySummary({ feeds, diapers }: { feeds: Feed[]; diapers: Diaper[] }) {
  const summary = summarizeDay(feeds, diapers);
  return (
    <section className="card stack" aria-label={es.daySummary}>
      <h2>{es.daySummary}</h2>
      <div className="stats">
        <p className="stat-line">
          <span className="muted">{es.feedsCount}</span>
          <strong>{formatStat(summary.feedCount)}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.minutesTotal}</span>
          <strong>{formatMinutes(summary.minutes)}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.left}</span>
          <strong>{formatMinutes(summary.leftMinutes)}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.right}</span>
          <strong>{formatMinutes(summary.rightMinutes)}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.meanGap}</span>
          <strong>{formatMinutes(summary.meanGapMinutes) ?? es.noData}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.diaperChanges}</span>
          <strong>{formatStat(summary.diaperChanges)}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.pee}</span>
          <strong>{formatStat(summary.pee)}</strong>
        </p>
        <p className="stat-line">
          <span className="muted">{es.poop}</span>
          <strong>{formatStat(summary.poop)}</strong>
        </p>
      </div>
    </section>
  );
}

function FeedForm({
  initialStart,
  initialEnd,
  initialSide,
  requireEnd,
  onCancel,
  onSave,
}: {
  initialStart: string;
  initialEnd: string;
  initialSide: FeedSide;
  requireEnd: boolean;
  onCancel: () => void;
  onSave: (startLocal: string, endLocal: string, side: FeedSide) => void;
}) {
  const [startLocal, setStartLocal] = useState(initialStart);
  const [endLocal, setEndLocal] = useState(initialEnd);
  const [nextSide, setNextSide] = useState<FeedSide>(initialSide);

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(startLocal, endLocal, nextSide);
      }}
    >
      <label>
        {es.start}
        <input required type="datetime-local" value={startLocal} onChange={(event) => setStartLocal(event.target.value)} />
      </label>
      <label>
        {es.end}
        <input required={requireEnd} type="datetime-local" value={endLocal} onChange={(event) => setEndLocal(event.target.value)} />
      </label>
      <div className="choice">
        {(["left", "right", "both"] as FeedSide[]).map((value) => (
          <button key={value} type="button" className={nextSide === value ? "selected" : "ghost"} onClick={() => setNextSide(value)}>
            {sideLabel(value)}
          </button>
        ))}
      </div>
      <button type="submit">{es.save}</button>
      <button type="button" className="ghost" onClick={onCancel}>
        {es.cancel}
      </button>
    </form>
  );
}

function DiaperForm({
  initialWhen,
  initialKind,
  onCancel,
  onSave,
}: {
  initialWhen: string;
  initialKind: DiaperKind;
  onCancel: () => void;
  onSave: (local: string, kind: DiaperKind) => void;
}) {
  const [when, setWhen] = useState(initialWhen);
  const [kind, setKind] = useState<DiaperKind>(initialKind);
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(when, kind);
      }}
    >
      <label>
        {es.time}
        <input required type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
      </label>
      <div className="choice">
        {(["pee", "poop", "both"] as DiaperKind[]).map((value) => (
          <button key={value} type="button" className={kind === value ? "selected with-icon" : "ghost with-icon"} onClick={() => setKind(value)}>
            <DiaperIcon />
            {diaperLabel(value)}
          </button>
        ))}
      </div>
      <button type="submit">{es.save}</button>
      <button type="button" className="ghost" onClick={onCancel}>
        {es.cancel}
      </button>
    </form>
  );
}
