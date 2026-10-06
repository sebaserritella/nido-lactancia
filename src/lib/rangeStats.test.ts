import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");

const householdId = "11111111-1111-1111-1111-111111111111";
const babyId = "22222222-2222-2222-2222-222222222222";
const userId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("range_stats_for_household", () => {
  const db = new PGlite({ extensions: { pgcrypto } });

  beforeAll(async () => {
    await db.exec(`
      create schema if not exists auth;
      create table auth.users (
        id uuid primary key,
        email text
      );
      create or replace function auth.uid() returns uuid
      language sql stable as $$ select null::uuid $$;
    `);
    for (const file of ["0001_schema.sql", "0002_rls.sql", "0003_rpc.sql", "0006_stats_skip_empty_days.sql", "0008_feed_pause.sql", "0009_both_counts_twice.sql", "0010_bottle_feeds.sql", "0011_feed_sessions.sql"]) {
      await db.exec(readFileSync(join(root, file), "utf8"));
    }
    await db.exec(`
      insert into auth.users (id, email)
      values ('${userId}', 'mama@nido-lactancia.local');
      insert into households (id) values ('${householdId}');
      insert into household_members (household_id, user_id)
      values ('${householdId}', '${userId}');
      insert into babies (id, household_id, name)
      values ('${babyId}', '${householdId}', 'Lola');

      insert into feeds (household_id, baby_id, started_at, ended_at, side, created_by)
      values
        ('${householdId}', '${babyId}', '2026-10-01T03:10:00Z', '2026-10-01T03:28:00Z', 'left', '${userId}'),
        ('${householdId}', '${babyId}', '2026-10-01T06:00:00Z', '2026-10-01T06:20:00Z', 'right', '${userId}'),
        ('${householdId}', '${babyId}', '2026-10-02T04:00:00Z', null, 'both', '${userId}'),
        ('${householdId}', '${babyId}', '2026-10-01T02:30:00Z', '2026-10-01T02:40:00Z', 'left', '${userId}');

      insert into diapers (household_id, baby_id, occurred_at, kind, created_by)
      values
        ('${householdId}', '${babyId}', '2026-10-01T15:00:00Z', 'pee', '${userId}'),
        ('${householdId}', '${babyId}', '2026-10-02T15:00:00Z', 'pee', '${userId}'),
        ('${householdId}', '${babyId}', '2026-10-03T15:00:00Z', 'both', '${userId}');
    `);
  });

  it("averages feeds, diapers, and gaps in the device timezone", async () => {
    const result = await db.query<{ stats: Stats }>(
      `select range_stats_for_household($1, $2, '2026-10-01', '2026-10-03', 'America/Argentina/Buenos_Aires') as stats`,
      [householdId, babyId],
    );
    const stats = result.rows[0].stats;
    expect(stats.day_count).toBe(3);
    expect(stats.feed_count).toBe(3);
    expect(stats.feeds_per_day).toBeCloseTo(1.5);
    expect(stats.minutes_per_feed).toBeCloseTo(19);
    expect(stats.pee_per_day).toBe(1);
    expect(stats.poop_per_day).toBe(1);
    expect(stats.both_diapers_per_day).toBe(1);
    expect(stats.mean_gap_minutes).toBeCloseTo(745);
  });

  it("counts a bottle as a feed and leaves its milliliters out of the minute average", async () => {
    const bottleBabyId = "55555555-5555-5555-5555-555555555555";
    await db.exec(`
      insert into babies (id, household_id, name)
      values ('${bottleBabyId}', '${householdId}', 'Nora');
      insert into feeds (household_id, baby_id, started_at, ended_at, side, created_by)
      values ('${householdId}', '${bottleBabyId}', '2026-10-01T15:00:00Z', '2026-10-01T15:20:00Z', 'left', '${userId}');
      insert into feeds (household_id, baby_id, started_at, ended_at, side, kind, ml, created_by)
      values ('${householdId}', '${bottleBabyId}', '2026-10-01T18:40:00Z', '2026-10-01T18:40:00Z', null, 'bottle', 90, '${userId}');
    `);
    const result = await db.query<{ stats: Stats }>(
      `select range_stats_for_household($1, $2, '2026-10-01', '2026-10-01', 'America/Argentina/Buenos_Aires') as stats`,
      [householdId, bottleBabyId],
    );
    expect(result.rows[0].stats.feed_count).toBe(2);
    expect(result.rows[0].stats.minutes_per_feed).toBeCloseTo(20);
  });

  it("counts two grouped breast feeds as one feed and drops the gap between them", async () => {
    const groupedBabyId = "66666666-6666-6666-6666-666666666666";
    const sessionId = "77777777-7777-7777-7777-777777777777";
    await db.exec(`
      insert into babies (id, household_id, name)
      values ('${groupedBabyId}', '${householdId}', 'Iris');
      insert into feeds (household_id, baby_id, started_at, ended_at, side, session_id, created_by)
      values
        ('${householdId}', '${groupedBabyId}', '2026-10-06T13:00:00Z', '2026-10-06T13:08:00Z', 'left', '${sessionId}', '${userId}'),
        ('${householdId}', '${groupedBabyId}', '2026-10-06T13:12:00Z', '2026-10-06T13:22:00Z', 'right', '${sessionId}', '${userId}'),
        ('${householdId}', '${groupedBabyId}', '2026-10-06T19:40:00Z', '2026-10-06T19:55:00Z', 'left', null, '${userId}');
    `);
    const result = await db.query<{ stats: Stats }>(
      `select range_stats_for_household($1, $2, '2026-10-06', '2026-10-06', 'America/Argentina/Buenos_Aires') as stats`,
      [householdId, groupedBabyId],
    );
    expect(result.rows[0].stats.feed_count).toBe(2);
    expect(result.rows[0].stats.feeds_per_day).toBe(2);
    expect(result.rows[0].stats.minutes_per_feed).toBeCloseTo(16.5);
    expect(result.rows[0].stats.mean_gap_minutes).toBe(400);
  });

  it("leaves paused minutes out of the average", async () => {
    const pausedBabyId = "44444444-4444-4444-4444-444444444444";
    await db.exec(`
      insert into babies (id, household_id, name)
      values ('${pausedBabyId}', '${householdId}', 'Paz');
      insert into feeds (household_id, baby_id, started_at, ended_at, paused_ms, side, created_by)
      values ('${householdId}', '${pausedBabyId}', '2026-10-01T15:00:00Z', '2026-10-01T15:20:00Z', ${5 * 60 * 1000}, 'left', '${userId}');
    `);
    const result = await db.query<{ stats: Stats }>(
      `select range_stats_for_household($1, $2, '2026-10-01', '2026-10-01', 'America/Argentina/Buenos_Aires') as stats`,
      [householdId, pausedBabyId],
    );
    expect(result.rows[0].stats.minutes_per_feed).toBeCloseTo(15);
  });

  it("skips days without that statistic and keeps a short feed under one minute", async () => {
    const otherBabyId = "33333333-3333-3333-3333-333333333333";
    await db.exec(`
      insert into babies (id, household_id, name)
      values ('${otherBabyId}', '${householdId}', 'Sol');
      insert into feeds (household_id, baby_id, started_at, ended_at, side, created_by)
      values ('${householdId}', '${otherBabyId}', '2026-10-01T15:00:00Z', '2026-10-01T15:00:30Z', 'left', '${userId}');
      insert into diapers (household_id, baby_id, occurred_at, kind, created_by)
      values
        ('${householdId}', '${otherBabyId}', '2026-10-01T15:00:00Z', 'poop', '${userId}'),
        ('${householdId}', '${otherBabyId}', '2026-10-02T15:00:00Z', 'pee', '${userId}'),
        ('${householdId}', '${otherBabyId}', '2026-10-02T18:00:00Z', 'pee', '${userId}');
    `);
    const result = await db.query<{ stats: Stats }>(
      `select range_stats_for_household($1, $2, '2026-10-01', '2026-10-03', 'America/Argentina/Buenos_Aires') as stats`,
      [householdId, otherBabyId],
    );
    const stats = result.rows[0].stats;
    expect(stats.feeds_per_day).toBe(1);
    expect(stats.minutes_per_feed).toBeCloseTo(0.5);
    expect(stats.pee_per_day).toBe(2);
    expect(stats.poop_per_day).toBe(1);
    expect(stats.both_diapers_per_day).toBeNull();
    expect(stats.mean_gap_minutes).toBeNull();
  });

  it("returns no per-day rate when the range has no records", async () => {
    const result = await db.query<{ stats: Stats }>(
      `select range_stats_for_household($1, $2, '2026-09-01', '2026-09-03', 'America/Argentina/Buenos_Aires') as stats`,
      [householdId, babyId],
    );
    const stats = result.rows[0].stats;
    expect(stats.day_count).toBe(3);
    expect(stats.feed_count).toBe(0);
    expect(stats.feeds_per_day).toBeNull();
    expect(stats.minutes_per_feed).toBeNull();
    expect(stats.pee_per_day).toBeNull();
    expect(stats.poop_per_day).toBeNull();
    expect(stats.both_diapers_per_day).toBeNull();
    expect(stats.mean_gap_minutes).toBeNull();
  });
});

type Stats = {
  day_count: number;
  feed_count: number;
  feeds_per_day: number | null;
  minutes_per_feed: number | null;
  pee_per_day: number | null;
  poop_per_day: number | null;
  both_diapers_per_day: number | null;
  mean_gap_minutes: number | null;
};
