const kilogramsPattern = /^\d+(\.\d{1,3})?$/;

export function kilogramsToGrams(input: string): number | null {
  const normalized = input.trim().replace(/\s+/g, "").replace(",", ".");
  if (!kilogramsPattern.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const thousandths = Number((fraction + "000").slice(0, 3));
  const grams = Number(whole) * 1000 + thousandths;
  if (!Number.isSafeInteger(grams) || grams <= 0 || grams >= 30_000) return null;
  return grams;
}

export function formatKilograms(grams: number): string {
  const whole = Math.trunc(grams / 1000);
  const thousandths = Math.abs(grams % 1000);
  const fraction = String(thousandths).padStart(3, "0").replace(/0+$/, "") || "0";
  return `${new Intl.NumberFormat("es-AR").format(whole)},${fraction}`;
}
