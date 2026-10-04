import { useEffect, useRef } from "react";
import type { PeriodBucket, StatGrain } from "../lib/periodStats";

export type BarSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type TimeBarsProps = {
  buckets: PeriodBucket[];
  grain: StatGrain;
  segmentsFor: (bucket: PeriodBucket) => BarSegment[];
  formatTick: (value: number) => string;
  legend: BarSegment[];
  onPrevious: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  previousLabel: string;
  nextLabel: string;
};

export function TimeBars({
  buckets,
  grain,
  segmentsFor,
  formatTick,
  legend,
  onPrevious,
  onNext,
  nextDisabled,
  previousLabel,
  nextLabel,
}: TimeBarsProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const totals = buckets.map((bucket) => segmentsFor(bucket).reduce((sum, segment) => sum + segment.value, 0));
  const max = axisMax(totals);
  const ticks = [max, max / 2, 0];

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [buckets, grain]);

  return (
    <div className="time-chart">
      <button type="button" className="ghost chart-nav" aria-label={previousLabel} onClick={onPrevious}>
        ‹
      </button>
      <div className="y-axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick}>{formatTick(tick)}</span>
        ))}
      </div>
      <div className="plot-scroll" ref={scroller}>
        <div className="plot" style={{ width: `max(100%, ${buckets.length * 44}px)` }}>
          {buckets.map((bucket, index) => {
            const segments = segmentsFor(bucket).filter((segment) => segment.value > 0);
            const total = totals[index] ?? 0;
            const detail = segments.map((segment) => `${segment.label} ${formatTick(segment.value)}`).join(", ");
            return (
              <div key={bucket.key} className="column">
                <div className="bar-slot">
                  <div
                    className="stack-bar"
                    style={{ height: `${(total / max) * 100}%` }}
                    role="img"
                    aria-label={`${axisLabel(bucket.key, grain)}${detail ? `, ${detail}` : ""}`}
                  >
                    {segments.map((segment) => (
                      <span key={segment.key} style={{ flexGrow: segment.value, background: segment.color }} />
                    ))}
                  </div>
                </div>
                <span className="x-label">{axisLabel(bucket.key, grain)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button type="button" className="ghost chart-nav" aria-label={nextLabel} disabled={nextDisabled} onClick={onNext}>
        ›
      </button>
      <ul className="chart-legend">
        {legend.map((item) => (
          <li key={item.key}>
            <span className="swatch" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function axisLabel(key: string, grain: StatGrain): string {
  if (grain === "month") {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  const [, month, day] = key.split("-");
  return `${Number(day)}/${Number(month)}`;
}

function axisMax(values: number[]): number {
  const peak = Math.max(0, ...values);
  if (peak <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const ratio = peak / magnitude;
  const step = ratio > 5 ? magnitude : ratio > 2 ? magnitude / 2 : magnitude / 5;
  return Math.ceil(peak / step) * step;
}
