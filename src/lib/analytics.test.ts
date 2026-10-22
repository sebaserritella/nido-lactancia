import { describe, expect, it } from "vitest";
import { buildAnalyticsEvent, failureReason } from "./analytics";

describe("buildAnalyticsEvent", () => {
  it("keeps a screen name and drops a baby name, an email, and milliliters", () => {
    expect(
      buildAnalyticsEvent("screen_view", {
        screen: "today",
        babies: "one",
        name: "Lola",
        email: "mama@example.com",
        ml: 90,
      }),
    ).toEqual({ name: "screen_view", params: { screen: "today", babies: "one" } });
  });

  it("drops an event whose screen is not a known screen", () => {
    expect(buildAnalyticsEvent("screen_view", { screen: "Lola" })).toBeNull();
  });

  it("keeps the feed source and drops the side and the raw error", () => {
    expect(
      buildAnalyticsEvent("feed_logged", {
        source: "past",
        side: "left",
        message: "duplicate key value violates unique constraint",
      }),
    ).toEqual({ name: "feed_logged", params: { source: "past" } });
  });

  it("rejects an unknown event", () => {
    expect(buildAnalyticsEvent("baby_weight", { grams: "6420" })).toBeNull();
  });

  it("keeps result for delete, group, and dismiss events", () => {
    for (const name of [
      "feed_deleted",
      "diaper_deleted",
      "weight_deleted",
      "feeds_grouped",
      "feeds_ungrouped",
      "feed_pair_dismissed",
    ] as const) {
      expect(buildAnalyticsEvent(name, { result: "ok", side: "left" })).toEqual({
        name,
        params: { result: "ok" },
      });
      expect(buildAnalyticsEvent(name, {})).toBeNull();
    }
  });

  it("allows the new actions on save_failed", () => {
    expect(
      buildAnalyticsEvent("save_failed", { action: "feed_deleted", reason: "unavailable" }),
    ).toEqual({ name: "save_failed", params: { action: "feed_deleted", reason: "unavailable" } });
    expect(
      buildAnalyticsEvent("save_failed", { action: "feeds_grouped", reason: "conflict" }),
    ).toEqual({ name: "save_failed", params: { action: "feeds_grouped", reason: "conflict" } });
  });

  it("keeps result for invite code and join events", () => {
    for (const name of ["invite_code_created", "household_joined"] as const) {
      expect(buildAnalyticsEvent(name, { result: "ok" })).toEqual({
        name,
        params: { result: "ok" },
      });
    }
    expect(
      buildAnalyticsEvent("save_failed", { action: "invite_code_created", reason: "unavailable" }),
    ).toEqual({
      name: "save_failed",
      params: { action: "invite_code_created", reason: "unavailable" },
    });
  });
});

describe("failureReason", () => {
  it("classifies conflicts and invalid input without returning the message", () => {
    expect(failureReason({ code: "23505", message: "duplicate key" })).toBe("conflict");
    expect(failureReason({ message: "User already registered" })).toBe("conflict");
    expect(failureReason({ code: "23514", message: "feeds_ended_after_start" })).toBe("invalid_input");
    expect(failureReason({ message: "No se pudo guardar. Probá de nuevo." })).toBe("unavailable");
  });
});
