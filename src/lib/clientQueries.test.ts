import { describe, expect, it } from "vitest";
import { queriedColumnsByTable } from "./clientQueries";

describe("queried columns", () => {
  it("follows a column constant and an inline select on the same table", () => {
    const source = `
      const feedColumns = "id, started_at, paused_ms, paused_at";
      client.from("feeds").select(feedColumns).eq("baby_id", baby.id);
      client
        .from("feeds")
        .select("id, ended_at")
        .order("started_at");
    `;
    expect([...(queriedColumnsByTable(source).get("feeds") ?? [])].sort()).toEqual([
      "ended_at",
      "id",
      "paused_at",
      "paused_ms",
      "started_at",
    ]);
  });
});
