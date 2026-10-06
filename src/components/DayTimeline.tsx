import type { ReactNode } from "react";
import type { DiaperKind, FeedSide } from "../domain";
import { diaperLabel, es } from "../i18n/es";
import {
  feedSpan,
  formatMinuteOfDay,
  hourCaption,
  hourTicks,
  hourWindow,
  localMinutes,
  timelinePercent,
  type MinuteSpan,
} from "../lib/dayTimeline";

type TimelineFeed = {
  id: string;
  started_at: string;
  ended_at: string | null;
  side: FeedSide | null;
  kind?: "breast" | "bottle";
  ml?: number | null;
};

type TimelineDiaper = {
  id: string;
  occurred_at: string;
  kind: DiaperKind;
};

type DayTimelineProps = {
  feeds: TimelineFeed[];
  diapers: TimelineDiaper[];
  timeZone: string;
  window?: { from: number; to: number };
};

type TimelineDay = {
  day: string;
  feeds: TimelineFeed[];
  diapers: TimelineDiaper[];
};

export function WeekTimeline({
  days,
  timeZone,
  selectedDay,
  onSelectDay,
}: {
  days: TimelineDay[];
  timeZone: string;
  selectedDay?: string;
  onSelectDay?: (day: string) => void;
}) {
  if (days.length === 0) return null;
  const window = hourWindow(days.flatMap((day) => eventSpans(day.feeds, day.diapers, timeZone)));
  return (
    <section className="card stack">
      <h2>{es.lastWeek}</h2>
      {days.map((day) => (
        <div key={day.day} className="stack">
          <button
            type="button"
            className={day.day === selectedDay ? "day-jump selected" : "day-jump"}
            onClick={() => onSelectDay?.(day.day)}
          >
            {day.day}
          </button>
          <DayTimeline feeds={day.feeds} diapers={day.diapers} timeZone={timeZone} window={window} />
        </div>
      ))}
    </section>
  );
}

export function DayTimeline({ feeds, diapers, timeZone, window }: DayTimelineProps) {
  const feedBars = feeds.flatMap((feed) => {
    if (feed.kind === "bottle" || feed.side === null) return [];
    const span = feedSpan(feed.started_at, feed.ended_at, timeZone);
    const sides: Array<"left" | "right"> = feed.side === "both" ? ["left", "right"] : [feed.side];
    return sides.map((side) => ({ id: `${feed.id}-${side}`, side, span, label: clockLabel(feed, timeZone) }));
  });
  const bottles = feeds
    .filter((feed) => feed.kind === "bottle")
    .map((feed) => {
      const minute = localMinutes(feed.started_at, timeZone);
      return { id: feed.id, minute, label: `${formatMinuteOfDay(minute)} ${es.bottle} ${feed.ml ?? ""} ${es.ml}`.trim() };
    });
  const marks = diapers.map((diaper) => {
    const minute = localMinutes(diaper.occurred_at, timeZone);
    return { id: diaper.id, minute, kind: diaper.kind, label: `${formatMinuteOfDay(minute)} ${diaperLabel(diaper.kind)}` };
  });
  const axis = window ?? hourWindow(eventSpans(feeds, diapers, timeZone));
  const hours = hourTicks(axis);

  return (
    <div className="day-timeline">
      <Lane name={es.left} hours={hours} window={axis}>
        {feedBars
          .filter((bar) => bar.side === "left")
          .map((bar) => (
            <Bar key={bar.id} span={bar.span} window={axis} color="#9c3d2e" label={bar.label} />
          ))}
      </Lane>
      <Lane name={es.right} hours={hours} window={axis}>
        {feedBars
          .filter((bar) => bar.side === "right")
          .map((bar) => (
            <Bar key={bar.id} span={bar.span} window={axis} color="#2f6f62" label={bar.label} />
          ))}
      </Lane>
      <Lane name={es.bottle} hours={hours} window={axis}>
        {bottles.map((mark) => (
          <span
            key={mark.id}
            className="bottle-mark"
            style={{ left: `${timelinePercent(axis, mark.minute)}%` }}
            title={mark.label}
            role="img"
            aria-label={mark.label}
          />
        ))}
      </Lane>
      <Lane name={es.diapersHeading} hours={hours} window={axis}>
        {marks.map((mark) => (
          <span
            key={mark.id}
            className={`diaper-mark ${mark.kind}`}
            style={{ left: `${timelinePercent(axis, mark.minute)}%` }}
            title={mark.label}
            role="img"
            aria-label={mark.label}
          />
        ))}
      </Lane>
      <div className="timeline-axis" aria-hidden="true">
        {hours.map((hour) => (
          <span key={hour} className="hour-label" style={{ left: `${timelinePercent(axis, hour)}%` }}>
            {hourCaption(hour, axis)}
          </span>
        ))}
      </div>
    </div>
  );
}

function eventSpans(feeds: TimelineFeed[], diapers: TimelineDiaper[], timeZone: string): MinuteSpan[] {
  return [
    ...feeds.map((feed) => feedSpan(feed.started_at, feed.ended_at, timeZone)),
    ...diapers.map((diaper) => {
      const minute = localMinutes(diaper.occurred_at, timeZone);
      return { startMin: minute, endMin: minute };
    }),
  ];
}

function Lane({
  name,
  hours,
  window,
  children,
}: {
  name: string;
  hours: number[];
  window: { from: number; to: number };
  children: ReactNode;
}) {
  return (
    <div className="timeline-lane">
      <span className="timeline-name">{name}</span>
      <div className="timeline-track">
        {hours.map((hour) => (
          <span key={hour} className="hour-line" style={{ left: `${timelinePercent(window, hour)}%` }} />
        ))}
        {children}
      </div>
    </div>
  );
}

function Bar({
  span,
  window,
  color,
  label,
}: {
  span: MinuteSpan;
  window: { from: number; to: number };
  color: string;
  label: string;
}) {
  const left = timelinePercent(window, span.startMin);
  const width = Math.max(timelinePercent(window, span.endMin) - left, 0);
  return (
    <span
      className="feed-bar"
      style={{ left: `${left}%`, width: `${width}%`, background: color }}
      title={label}
      role="img"
      aria-label={label}
    />
  );
}

function clockLabel(feed: TimelineFeed, timeZone: string): string {
  const start = formatMinuteOfDay(localMinutes(feed.started_at, timeZone));
  if (feed.ended_at === null) return `${start} ${es.inProgress}`;
  return `${start}–${formatMinuteOfDay(localMinutes(feed.ended_at, timeZone))}`;
}
