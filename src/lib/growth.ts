import { lengthFemale, lengthMale, weightFemale, weightMale, type LmsRow } from "./whoGrowthTables";

export type Sex = "female" | "male";
export type GrowthKind = "weight" | "length";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Percentile lines drawn on the chart, with their z-scores. */
export const percentileLines: readonly { label: string; z: number }[] = [
  { label: "P3", z: -1.881 },
  { label: "P15", z: -1.036 },
  { label: "P50", z: 0 },
  { label: "P85", z: 1.036 },
  { label: "P97", z: 1.881 },
];

export const maxAgeDays = 730.5;

function table(kind: GrowthKind, sex: Sex): readonly LmsRow[] {
  if (kind === "weight") return sex === "male" ? weightMale : weightFemale;
  return sex === "male" ? lengthMale : lengthFemale;
}

/** Days between two ISO calendar dates. */
export function ageInDays(bornOn: string, measuredOn: string): number {
  return Math.round((Date.parse(`${measuredOn}T00:00:00Z`) - Date.parse(`${bornOn}T00:00:00Z`)) / DAY_MS);
}

/** 37+0 weeks, in days. */
export const pretermBelowDays = 37 * 7;
/** 40+0 weeks, in days. */
export const termDays = 40 * 7;

/** True when the baby is compared by corrected age: born before 37+0 weeks. */
export function usesCorrectedAge(gestationalDays: number | null | undefined): gestationalDays is number {
  return typeof gestationalDays === "number" && gestationalDays < pretermBelowDays;
}

/** Reads "37", "37.1", "37,1" or "37+1" as weeks and days (0–6). Empty is null; anything else is undefined. */
export function parseGestation(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const match = /^(\d{2})(?:\s*[.,+]\s*(\d))?$/.exec(trimmed);
  if (!match) return undefined;
  const weeks = Number(match[1]);
  const days = match[2] === undefined ? 0 : Number(match[2]);
  if (days > 6) return undefined;
  const total = weeks * 7 + days;
  if (total < 22 * 7 || total > 44 * 7 + 6) return undefined;
  return total;
}

/** Days as "37+1" (or "37" with no extra days). */
export function formatGestation(totalDays: number): string {
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return days === 0 ? String(weeks) : `${weeks}+${days}`;
}

/**
 * Age in days for the growth curves. Born before 37+0 weeks, the days missing to 40+0 are subtracted (corrected age)
 * while the baby is under 2 years. Can be negative before the due date.
 */
export function growthAgeDays(bornOn: string, measuredOn: string, gestationalDays?: number | null): number {
  const chronological = ageInDays(bornOn, measuredOn);
  if (!usesCorrectedAge(gestationalDays) || chronological > maxAgeDays) return chronological;
  return chronological - (termDays - gestationalDays);
}

/** L, M and S at an age, interpolated between the WHO nodes. Null outside 0–24 months. */
export function lmsAt(kind: GrowthKind, sex: Sex, ageDays: number): { l: number; m: number; s: number } | null {
  const rows = table(kind, sex);
  if (ageDays < 0 || ageDays > rows[rows.length - 1][0]) return null;
  for (let index = 1; index < rows.length; index += 1) {
    const [rightAge, rightL, rightM, rightS] = rows[index];
    if (ageDays > rightAge) continue;
    const [leftAge, leftL, leftM, leftS] = rows[index - 1];
    const t = (ageDays - leftAge) / (rightAge - leftAge);
    return { l: leftL + t * (rightL - leftL), m: leftM + t * (rightM - leftM), s: leftS + t * (rightS - leftS) };
  }
  const [, l, m, s] = rows[0];
  return { l, m, s };
}

/** Value at a z-score for given L, M and S. */
export function valueAtZ({ l, m, s }: { l: number; m: number; s: number }, z: number): number {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

/** WHO z-score. Weight beyond ±3 uses the WHO restricted extension. */
export function zScore(kind: GrowthKind, value: number, lms: { l: number; m: number; s: number }): number {
  const { l, m, s } = lms;
  const z = l === 0 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
  if (kind !== "weight" || Math.abs(z) <= 3) return z;
  if (z > 3) {
    const sd3 = valueAtZ(lms, 3);
    return 3 + (value - sd3) / (sd3 - valueAtZ(lms, 2));
  }
  const sd3neg = valueAtZ(lms, -3);
  return -3 + (value - sd3neg) / (valueAtZ(lms, -2) - sd3neg);
}

/** Standard normal cumulative distribution, as a percentile 0–100. */
export function percentileFromZ(z: number): number {
  return 50 * (1 + erf(z / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

/**
 * WHO percentile for a weight (kg) or length (cm) on a date. Null without sex or birth date, or outside 0–24 months.
 */
export function growthPercentile(
  kind: GrowthKind,
  sex: Sex | null | undefined,
  bornOn: string | null | undefined,
  measuredOn: string,
  value: number,
  gestationalDays?: number | null,
): number | null {
  if (!sex || !bornOn || !(value > 0)) return null;
  const lms = lmsAt(kind, sex, growthAgeDays(bornOn, measuredOn, gestationalDays));
  if (!lms) return null;
  return percentileFromZ(zScore(kind, value, lms));
}

export function formatPercentile(percentile: number): string {
  if (percentile < 1) return "<P1";
  if (percentile > 99) return ">P99";
  return `P${Math.round(percentile)}`;
}
