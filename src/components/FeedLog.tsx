import type { ReactNode } from "react";
import type { Feed } from "../domain";
import { es, sideLabel } from "../i18n/es";
import { activeMinutes } from "../lib/feedDuration";
import { feedBlocks, groupableFeeds, tomaCount, type DismissedPair } from "../lib/feedSessions";
import { formatMinutes } from "../lib/format";
import { toDatetimeLocalValue } from "../lib/localTime";
import { FeedIcon } from "./EventIcons";

type FeedLogProps = {
  feeds: Feed[];
  dismissed: DismissedPair[];
  timeZone: string;
  plain?: boolean;
  selectedIds: ReadonlySet<string>;
  onToggle: (ids: string[]) => void;
  onGroup: (feeds: Feed[]) => void;
  onUngroup: (sessionId: string) => void;
  onDismiss: (earlierId: string, laterId: string) => void;
  renderExtra?: (feed: Feed) => ReactNode;
};

export function FeedLog({
  feeds,
  dismissed,
  timeZone,
  plain = false,
  selectedIds,
  onToggle,
  onGroup,
  onUngroup,
  onDismiss,
  renderExtra,
}: FeedLogProps) {
  const blocks = feedBlocks(feeds, dismissed);
  const chosen = groupableFeeds(feeds, selectedIds);
  const selectedTomas = tomaCount(chosen);
  const bottleSelected = feeds.some((feed) => selectedIds.has(feed.id) && feed.kind === "bottle");
  if (feeds.length === 0) return null;

  return (
    <>
      <ul className={plain ? "entries plain" : "entries"}>
        {blocks.map((block) => {
          if (block.kind === "suggestion") {
            const side = block.later.side ? sideLabel(block.later.side).toLowerCase() : es.breast.toLowerCase();
            return (
              <li key={`suggest-${block.earlier.id}-${block.later.id}`} className="suggest">
                <p>{es.sameFeedAsk(side, block.idleMinutes)}</p>
                <div className="row-actions">
                  <button type="button" onClick={() => onGroup([block.earlier, block.later])}>
                    {es.groupFeeds}
                  </button>
                  <button type="button" className="ghost" onClick={() => onDismiss(block.earlier.id, block.later.id)}>
                    {es.separateFeeds}
                  </button>
                </div>
              </li>
            );
          }
          if (block.kind === "group") {
            const ids = block.feeds.map((feed) => feed.id);
            return (
              <li key={block.sessionId} className="feed-group">
                <div className="feed-group-row">
                  <input
                    className="feed-check"
                    type="checkbox"
                    aria-label={es.includeInGroup}
                    checked={ids.every((id) => selectedIds.has(id))}
                    onChange={() => onToggle(ids)}
                  />
                  <div className="feed-group-body">
                    <div className="entry-line group-head">
                      <div className="entry-copy">
                        <strong className="entry-time">{spanLabel(block.feeds, timeZone)}</strong>
                        <div className="chips">
                          <span className="chip">{groupSides(block.feeds)}</span>
                          {groupMinutes(block.feeds) ? <span className="chip ok">{es.totalTime(groupMinutes(block.feeds)!)}</span> : null}
                        </div>
                      </div>
                      <button type="button" className="ghost" onClick={() => onUngroup(block.sessionId)}>
                        {es.ungroup}
                      </button>
                    </div>
                    <ul className="nested">
                      {block.feeds.map((feed) => (
                        <li key={feed.id}>
                          <FeedLine feed={feed} timeZone={timeZone} />
                          {renderExtra?.(feed)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            );
          }
          return (
            <li key={block.feed.id}>
              <FeedLine
                feed={block.feed}
                timeZone={timeZone}
                checked={selectedIds.has(block.feed.id)}
                onToggle={() => onToggle([block.feed.id])}
              />
              {renderExtra?.(block.feed)}
            </li>
          );
        })}
      </ul>
      {selectedTomas >= 2 ? (
        <button type="button" onClick={() => onGroup(chosen)}>
          {es.groupSelected(selectedTomas)}
        </button>
      ) : null}
      {bottleSelected ? <p className="muted">{es.bottleStaysOut}</p> : null}
    </>
  );
}

function FeedLine({
  feed,
  timeZone,
  checked,
  onToggle,
}: {
  feed: Feed;
  timeZone: string;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const start = toDatetimeLocalValue(feed.started_at, timeZone).slice(11);
  return (
    <div className="entry-line">
      {onToggle ? (
        <input className="feed-check" type="checkbox" aria-label={es.includeInGroup} checked={checked} onChange={onToggle} />
      ) : null}
      <FeedIcon />
      <div className="entry-copy">
        <strong className="entry-time">
          {start}
          {feed.kind === "bottle" || !feed.ended_at ? "" : `–${toDatetimeLocalValue(feed.ended_at, timeZone).slice(11)}`}
        </strong>
        <div className="chips">
          {feed.kind === "bottle" ? (
            <>
              <span className="chip">{es.bottle}</span>
              <span className="chip ok">
                {feed.ml} {es.ml}
              </span>
            </>
          ) : (
            <>
              {feed.side ? <span className="chip">{sideLabel(feed.side)}</span> : null}
              {feed.ended_at ? (
                <span className="chip ok">{formatMinutes(activeMinutes(feed))}</span>
              ) : (
                <span className="chip accent">{feed.paused_at ? es.paused : es.inProgress}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function spanLabel(feeds: Feed[], timeZone: string): string {
  const ordered = [...feeds].sort((left, right) => left.started_at.localeCompare(right.started_at));
  const start = toDatetimeLocalValue(ordered[0].started_at, timeZone).slice(11);
  const last = ordered[ordered.length - 1];
  if (!last.ended_at) return start;
  return `${start}–${toDatetimeLocalValue(last.ended_at, timeZone).slice(11)}`;
}

function groupSides(feeds: Feed[]): string {
  const sides: ("left" | "right" | "both")[] = [];
  for (const feed of [...feeds].sort((left, right) => left.started_at.localeCompare(right.started_at))) {
    if (feed.side && !sides.includes(feed.side)) sides.push(feed.side);
  }
  return sides.map(sideLabel).join(" + ");
}

function groupMinutes(feeds: Feed[]): string | null {
  const finished = feeds.filter((feed) => feed.ended_at !== null);
  if (finished.length === 0) return null;
  return formatMinutes(finished.reduce((total, feed) => total + activeMinutes(feed), 0));
}
