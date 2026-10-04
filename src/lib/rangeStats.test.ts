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
    for (const file of ["0001_schema.sql", "0002_rls.sql", "0003_rpc.sql"]) {
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
    expect(stats.feeds_per_day).toBeCloseTo(1);
    expect(stats.minutes_per_feed).toBeCloseTo(19);
    expect(stats.pee_per_day).toBeCloseTo(2 / 3);
    expect(stats.poop_per_day).toBe(0);
    expect(stats.both_diapers_per_day).toBeCloseTo(1 / 3);
    expect(stats.mean_gap_minutes).toBeCloseTo(745);
  });
});

type Stats = {
  day_count: number;
  feed_count: number;
  feeds_per_day: number;
  minutes_per_feed: number;
  pee_per_day: number;
  poop_per_day: number;
  both_diapers_per_day: number;
  mean_gap_minutes: number | null;
};
