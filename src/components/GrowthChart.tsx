import { ageInDays, lmsAt, maxAgeDays, percentileLines, valueAtZ, type GrowthKind, type Sex } from "../lib/growth";
import { es } from "../i18n/es";

type Point = { measuredOn: string; value: number };

type GrowthChartProps = {
  kind: GrowthKind;
  sex: Sex;
  bornOn: string;
  points: Point[];
};

const width = 320;
const height = 210;
const pad = { left: 30, right: 30, top: 10, bottom: 28 };
const monthDays = 30.4375;

/** WHO percentile curves with the baby's measurements, from birth to a little past the last one. */
export function GrowthChart({ kind, sex, bornOn, points }: GrowthChartProps) {
  const measured = points
    .map((point) => ({ age: ageInDays(bornOn, point.measuredOn), value: point.value }))
    .filter((point) => point.age >= 0 && point.age <= maxAgeDays)
    .sort((left, right) => left.age - right.age);
  if (measured.length === 0) return null;

  const lastAge = measured[measured.length - 1].age;
  const months = Math.min(24, Math.max(3, Math.ceil(lastAge / monthDays) + 2));
  const endAge = Math.min(maxAgeDays, months * monthDays);

  const steps = 48;
  const curves = percentileLines.map((line) => {
    const samples: { age: number; value: number }[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const age = (endAge * step) / steps;
      const lms = lmsAt(kind, sex, age);
      if (lms) samples.push({ age, value: valueAtZ(lms, line.z) });
    }
    return { ...line, samples };
  });

  const values = [...curves.flatMap((curve) => curve.samples.map((sample) => sample.value)), ...measured.map((point) => point.value)];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const tick = kind === "weight" ? (rawMax - rawMin > 6 ? 2 : 1) : rawMax - rawMin > 20 ? 5 : 2;
  const minY = Math.floor(rawMin / tick) * tick;
  const maxY = Math.ceil(rawMax / tick) * tick;

  const x = (age: number) => pad.left + ((width - pad.left - pad.right) * age) / endAge;
  const y = (value: number) => height - pad.bottom - ((height - pad.top - pad.bottom) * (value - minY)) / (maxY - minY);
  const path = (samples: { age: number; value: number }[]) =>
    samples.map((sample, index) => `${index === 0 ? "M" : "L"}${x(sample.age).toFixed(1)},${y(sample.value).toFixed(1)}`).join(" ");

  const monthStep = months <= 6 ? 1 : months <= 12 ? 2 : 3;
  const monthTicks: number[] = [];
  for (let month = 0; month <= months; month += monthStep) monthTicks.push(month);
  const valueTicks: number[] = [];
  for (let value = minY; value <= maxY + 1e-9; value += tick) valueTicks.push(value);

  const unit = kind === "weight" ? es.kg : es.cm;
  const title = kind === "weight" ? es.growthWeightTitle : es.growthLengthTitle;

  return (
    <figure className="growth-chart" style={{ margin: 0 }}>
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {valueTicks.map((value) => (
          <g key={`y${value}`}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="#efe5d8" strokeWidth={1} />
            <text x={pad.left - 4} y={y(value) + 3} fontSize={9} textAnchor="end" fill="#6e625a">
              {value}
            </text>
          </g>
        ))}
        {monthTicks.map((month) => (
          <text key={`x${month}`} x={x(month * monthDays)} y={height - pad.bottom + 12} fontSize={9} textAnchor="middle" fill="#6e625a">
            {month}
          </text>
        ))}
        <text x={(pad.left + width - pad.right) / 2} y={height - 4} fontSize={9} textAnchor="middle" fill="#6e625a">
          {es.growthAgeMonths}
        </text>
        <text x={pad.left + 4} y={pad.top + 8} fontSize={9} fill="#6e625a">
          {unit}
        </text>
        {curves.map((curve) => {
          const last = curve.samples[curve.samples.length - 1];
          const median = curve.z === 0;
          return (
            <g key={curve.label}>
              <path d={path(curve.samples)} fill="none" stroke={median ? "#8a7a6c" : "#cdbba6"} strokeWidth={median ? 1.6 : 1} />
              {last ? (
                <text x={x(last.age) + 3} y={y(last.value) + 3} fontSize={8.5} fill="#6e625a">
                  {curve.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {measured.length > 1 ? <path d={path(measured)} fill="none" stroke="#9c3d2e" strokeWidth={1.6} /> : null}
        {measured.map((point) => (
          <circle key={`${point.age}-${point.value}`} cx={x(point.age)} cy={y(point.value)} r={3} fill="#9c3d2e" />
        ))}
      </svg>
    </figure>
  );
}
