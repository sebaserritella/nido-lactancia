import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { queriedColumnsFromSources } from "./clientQueries";
import { readAppSources } from "./readAppSources";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const required = process.env.CHECK_LIVE_SCHEMA === "1";
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

describe("live schema", () => {
  it("has the Supabase URL and anon key when the deploy check is on", () => {
    if (!required) return;
    expect(supabaseUrl, "VITE_SUPABASE_URL").toBeTruthy();
    expect(anonKey, "VITE_SUPABASE_ANON_KEY").toBeTruthy();
  });

  it.skipIf(!required || !supabaseUrl || !anonKey)(
    "rejects a deploy when the live database is missing a column the app selects",
    async () => {
      const queries = queriedColumnsFromSources(readAppSources(join(repoRoot, "src")));
      const missing: string[] = [];
      for (const [table, columns] of queries) {
        const select = [...columns].sort().join(",");
        const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, {
          headers: {
            apikey: anonKey ?? "",
            Authorization: `Bearer ${anonKey ?? ""}`,
          },
        });
        if (response.ok) continue;
        const body = await response.text();
        missing.push(`${table} (${select}) -> ${response.status} ${body}`);
      }
      expect(missing, "Apply the pending supabase/migrations file before deploying. Pages would publish a client the database cannot serve.").toEqual(
        [],
      );
    },
  );
});
