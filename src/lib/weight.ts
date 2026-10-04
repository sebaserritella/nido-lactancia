const kilogramsPattern = /^\d+(\.\d)?$/;

export function kilogramsToGrams(input: string): number | null {
  const normalized = input.trim().replace(/\s+/g, "").replace(",", ".");
  if (!kilogramsPattern.test(normalized)) return null;
  const [whole, tenth = "0"] = normalized.split(".");
  const grams = Number(whole) * 1000 + Number(tenth) * 100;
  if (!Number.isSafeInteger(grams) || grams <= 0 || grams >= 30_000) return null;
  return grams;
}

export function formatKilograms(grams: number): string {
  const tenths = Math.round(grams / 100);
  const whole = Math.floor(tenths / 10);
  const tenth = tenths % 10;
  return `${new Intl.NumberFormat("es-AR").format(whole)},${tenth}`;
}
