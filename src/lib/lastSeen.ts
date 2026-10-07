export const LAST_SEEN_THROTTLE_MS = 10 * 60_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type TouchClient = {
  rpc: (name: string) => PromiseLike<{ error: { message: string } | null }>;
};

function storageKey(userId: string): string {
  return `nido:last-seen:${userId}`;
}

export function shouldTouchLastSeen(
  storage: StorageLike,
  userId: string,
  nowMs: number,
  throttleMs: number = LAST_SEEN_THROTTLE_MS,
): boolean {
  const raw = storage.getItem(storageKey(userId));
  if (!raw) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= throttleMs;
}

export function markLastSeenTouched(storage: StorageLike, userId: string, nowMs: number): void {
  storage.setItem(storageKey(userId), String(nowMs));
}

export async function touchLastSeenIfDue(
  client: TouchClient,
  storage: StorageLike,
  userId: string,
  nowMs: number = Date.now(),
  throttleMs: number = LAST_SEEN_THROTTLE_MS,
): Promise<void> {
  if (!shouldTouchLastSeen(storage, userId, nowMs, throttleMs)) return;
  try {
    const { error } = await client.rpc("touch_last_seen");
    if (error) return;
    markLastSeenTouched(storage, userId, nowMs);
  } catch {
    // Never block the tracker on presence bookkeeping.
  }
}
