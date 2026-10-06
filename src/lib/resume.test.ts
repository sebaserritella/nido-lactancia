import { describe, expect, it } from "vitest";
import {
  authStorageKey,
  localDbKey,
  openingState,
  readResume,
  rememberBabies,
  rememberLatest,
  rememberTab,
  resumeKey,
} from "./resume";

const url = "https://wchabjbygpmlqadxsmuc.supabase.co";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("opening state", () => {
  it("uses the supabase project ref as the auth storage key", () => {
    expect(authStorageKey(url)).toBe("sb-wchabjbygpmlqadxsmuc-auth-token");
  });

  it("opens the tracker when a stored session and household belong to the same user", () => {
    const storage = memory();
    storage.setItem(
      authStorageKey(url),
      JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 1, user: { id: "user-1" } }),
    );
    storage.setItem(
      resumeKey,
      JSON.stringify({
        userId: "user-1",
        householdId: "house-1",
        babies: [{ id: "baby-1", household_id: "house-1", name: "Lola", born_on: "2026-06-01" }],
        tab: "today",
        latest: {},
      }),
    );

    expect(openingState(storage, { url })).toEqual({
      userId: "user-1",
      householdId: "house-1",
      babies: [{ id: "baby-1", household_id: "house-1", name: "Lola", born_on: "2026-06-01" }],
      tab: "today",
      latest: {},
    });
  });

  it("stays logged out when a resume exists but the auth token is gone", () => {
    const storage = memory();
    storage.setItem(
      resumeKey,
      JSON.stringify({
        userId: "user-1",
        householdId: "house-1",
        babies: [],
        tab: "history",
        latest: {},
      }),
    );

    expect(openingState(storage, { url }).userId).toBeNull();
  });

  it("ignores a resume that belongs to someone else", () => {
    const storage = memory();
    storage.setItem(authStorageKey(url), JSON.stringify({ user: { id: "user-2" } }));
    storage.setItem(
      resumeKey,
      JSON.stringify({ userId: "user-1", householdId: "house-1", babies: [], tab: "today", latest: {} }),
    );

    const opening = openingState(storage, { url });
    expect(opening.userId).toBe("user-2");
    expect(opening.householdId).toBeNull();
  });

  it("reads the local session, household, and babies without waiting", () => {
    const storage = memory();
    storage.setItem(
      localDbKey,
      JSON.stringify({
        sessionUserId: "user-1",
        members: [{ user_id: "user-1", household_id: "house-1" }],
        babies: [{ id: "baby-1", household_id: "house-1", name: "Lola", born_on: null }],
      }),
    );

    expect(openingState(storage, null)).toMatchObject({
      userId: "user-1",
      householdId: "house-1",
      babies: [{ id: "baby-1", household_id: "house-1", name: "Lola", born_on: null }],
    });
  });

  it("remembers babies, the open tab, and the latest events for the next visit", () => {
    const storage = memory();
    const baby = { id: "baby-1", household_id: "house-1", name: "Lola", born_on: "2026-06-01" };
    rememberBabies(storage, "user-1", "house-1", [baby]);
    rememberTab(storage, "user-1", "history");
    rememberLatest(storage, "user-1", "baby-1", {
      feed: {
        id: "feed-1",
        started_at: "2026-10-05T01:51:00.000Z",
        ended_at: "2026-10-05T01:51:00.000Z",
        paused_ms: 0,
        paused_at: null,
        side: null,
        kind: "bottle",
        ml: 90,
      },
      diaper: { id: "diaper-1", occurred_at: "2026-10-05T18:10:00.000Z", kind: "pee" },
    });

    expect(readResume(storage, "user-1")).toMatchObject({
      householdId: "house-1",
      babies: [baby],
      tab: "history",
      latest: {
        "baby-1": {
          feed: { id: "feed-1", ml: 90 },
          diaper: { id: "diaper-1", kind: "pee" },
        },
      },
    });
  });
});
