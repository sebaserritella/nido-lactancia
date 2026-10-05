import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";
import { queriedColumnsFromSources } from "./clientQueries";
import { readAppSources } from "./readAppSources";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = join(repoRoot, "supabase/migrations");

type ColumnRow = { column_name: string };

describe("schema contract", () => {
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
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of files) {
      await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    }
  });

  it("fails when the app selects a column the migrations never create", async () => {
    const missing = await missingColumns(db, new Map([["feeds", new Set(["not_a_column"])]]));
    expect(missing).toEqual(["feeds.not_a_column"]);
  });

  it("keeps every column the app selects present after all migrations", async () => {
    const queries = queriedColumnsFromSources(readAppSources(join(repoRoot, "src")));
    expect(queries.get("feeds")?.has("paused_ms")).toBe(true);
    expect(queries.get("feeds")?.has("paused_at")).toBe(true);
    const missing = await missingColumns(db, queries);
    expect(missing).toEqual([]);
  });
});

async function missingColumns(db: PGlite, queries: Map<string, Set<string>>): Promise<string[]> {
  const missing: string[] = [];
  for (const [table, columns] of queries) {
    const result = await db.query<ColumnRow>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
      [table],
    );
    const present = new Set(result.rows.map((row) => row.column_name));
    if (present.size === 0) {
      missing.push(`${table} (table missing)`);
      continue;
    }
    for (const column of [...columns].sort()) {
      if (!present.has(column)) missing.push(`${table}.${column}`);
    }
  }
  return missing;
}
