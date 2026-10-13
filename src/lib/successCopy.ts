import type { DiaperKind, FeedSide } from "../domain";
import { diaperLabel, es, sideLabel } from "../i18n/es";
import { formatMinutes } from "./format";
import { toDatetimeLocalValue } from "./localTime";

export type SuccessNotice = { title: string; lines: string[] };

function clock(iso: string, timeZone: string): string {
  return toDatetimeLocalValue(iso, timeZone).slice(11);
}

export function breastStartedNotice(side: FeedSide, startedAtIso: string, timeZone: string): SuccessNotice {
  return {
    title: es.feedStartedTitle,
    lines: [`${sideLabel(side)} · ${es.sinceTime(clock(startedAtIso, timeZone))}`],
  };
}

export function breastSavedNotice(args: {
  side: FeedSide;
  startedAtIso: string;
  endedAtIso: string | null;
  minutes: number | null;
  updated: boolean;
  timeZone: string;
}): SuccessNotice {
  const start = clock(args.startedAtIso, args.timeZone);
  const span = args.endedAtIso ? `${start}–${clock(args.endedAtIso, args.timeZone)}` : start;
  const mins = formatMinutes(args.minutes);
  const detail = mins ? `${sideLabel(args.side)} · ${span} · ${mins}` : `${sideLabel(args.side)} · ${span}`;
  return {
    title: args.updated ? es.feedUpdatedTitle : es.feedSavedTitle,
    lines: [detail],
  };
}

export function bottleSavedNotice(ml: number, whenIso: string, timeZone: string, updated: boolean): SuccessNotice {
  return {
    title: updated ? es.bottleUpdatedTitle : es.bottleSavedTitle,
    lines: [`${ml} ${es.ml} · ${clock(whenIso, timeZone)}`],
  };
}

export function diaperSavedNotice(kind: DiaperKind, whenIso: string, timeZone: string, updated: boolean): SuccessNotice {
  return {
    title: updated ? es.diaperUpdatedTitle : es.diaperSavedTitle,
    lines: [`${diaperLabel(kind)} · ${clock(whenIso, timeZone)}`],
  };
}
