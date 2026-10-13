const centimetersPattern = /^\d+(\.\d)?$/;

export function centimetersToMillimeters(input: string): number | null {
  const normalized = input.trim().replace(/\s+/g, "").replace(",", ".");
  if (!centimetersPattern.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const tenths = Number((fraction + "0").slice(0, 1));
  const millimeters = Number(whole) * 10 + tenths;
  if (!Number.isSafeInteger(millimeters) || millimeters < 200 || millimeters > 1200) return null;
  return millimeters;
}

export function formatCentimeters(lengthMm: number): string {
  const whole = Math.trunc(lengthMm / 10);
  const tenths = Math.abs(lengthMm % 10);
  return `${new Intl.NumberFormat("es-AR").format(whole)},${tenths}`;
}
