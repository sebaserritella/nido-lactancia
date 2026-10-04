import type { Portion } from "../lib/periodStats";

const sliceColor: Record<Portion["key"], string> = {
  left: "#9c3d2e",
  right: "#2f6f62",
  both: "#c4a15a",
  pee: "#3d6f9c",
  poop: "#8a5a3a",
};

type SharePieProps = {
  portions: Portion[];
  labelFor: (key: Portion["key"]) => string;
  valueFor: (portion: Portion) => string;
};

export function SharePie({ portions, labelFor, valueFor }: SharePieProps) {
  if (portions.length === 0) return null;

  let cursor = 0;
  const stops = portions.map((portion) => {
    const start = cursor;
    cursor += portion.share * 100;
    return `${sliceColor[portion.key]} ${start}% ${cursor}%`;
  });
  const legend = portions
    .map((portion) => `${labelFor(portion.key)} ${valueFor(portion)} ${formatShare(portion.share)}`)
    .join(", ");

  return (
    <div className="pie-row">
      <div className="pie" style={{ background: `conic-gradient(${stops.join(", ")})` }} role="img" aria-label={legend} />
      <ul className="pie-legend">
        {portions.map((portion) => (
          <li key={portion.key}>
            <span className="swatch" style={{ background: sliceColor[portion.key] }} />
            <span>
              {labelFor(portion.key)}
              <strong>
                {valueFor(portion)} · {formatShare(portion.share)}
              </strong>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatShare(share: number): string {
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 }).format(share);
}
