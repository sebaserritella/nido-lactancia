import { describe, expect, it, vi } from "vitest";
import { markLastSeenTouched, shouldTouchLastSeen, touchLastSeenIfDue } from "./lastSeen";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("lastSeen", () => {
  it("touches when never marked", () => {
    const storage = memoryStorage();
    expect(shouldTouchLastSeen(storage, "user-1", 1_000_000)).toBe(true);
  });

  it("skips within the throttle window", () => {
    const storage = memoryStorage();
    markLastSeenTouched(storage, "user-1", 1_000_000);
    expect(shouldTouchLastSeen(storage, "user-1", 1_000_000 + 5 * 60_000)).toBe(false);
  });

  it("touches again after the throttle window", () => {
    const storage = memoryStorage();
    markLastSeenTouched(storage, "user-1", 1_000_000);
    expect(shouldTouchLastSeen(storage, "user-1", 1_000_000 + 10 * 60_000)).toBe(true);
  });

  it("calls the rpc and marks only on success", async () => {
    const storage = memoryStorage();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await touchLastSeenIfDue({ rpc }, storage, "user-1", 1_000_000);
    expect(rpc).toHaveBeenCalledWith("touch_last_seen");
    expect(shouldTouchLastSeen(storage, "user-1", 1_000_000 + 1_000)).toBe(false);
  });

  it("does not mark when the rpc fails", async () => {
    const storage = memoryStorage();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    await touchLastSeenIfDue({ rpc }, storage, "user-1", 1_000_000);
    expect(shouldTouchLastSeen(storage, "user-1", 1_000_000 + 1_000)).toBe(true);
  });
});
