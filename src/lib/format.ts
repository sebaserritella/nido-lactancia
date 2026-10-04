export function formatStat(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
}

export function formatMinutes(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 60) {
    return `${rounded} min`;
  }
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondText = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondText}`;
  }
  return `${minutes}:${secondText}`;
}
