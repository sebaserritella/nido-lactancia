import { describe, expect, it } from "vitest";
import { createLocalClient } from "./localClient";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("local client", () => {
  it("creates a family, stores a feed, and rejects a second open feed", async () => {
    const client = createLocalClient(memoryStorage());
    const signUp = await client.auth.signUp({ email: "mama@example.com", password: "secret1" });
    expect(signUp.error).toBeNull();

    const created = await client.rpc("bootstrap_household");
    expect(typeof created.data).toBe("string");

    const baby = await client.from("babies").insert({ household_id: created.data, name: "Lola" }).select("id, name").single();
    expect(baby.data).toMatchObject({ name: "Lola" });

    const babyId = (baby.data as { id: string }).id;
    const first = await client.from("feeds").insert({
      household_id: created.data,
      baby_id: babyId,
      started_at: "2026-10-04T03:10:00.000Z",
      side: "left",
    });
    expect(first.error).toBeNull();

    const second = await client.from("feeds").insert({
      household_id: created.data,
      baby_id: babyId,
      started_at: "2026-10-04T04:00:00.000Z",
      side: "right",
    });
    expect(second.error?.code).toBe("23505");
  });

  it("lets a second user join with the invite code", async () => {
    const storage = memoryStorage();
    const owner = createLocalClient(storage);
    await owner.auth.signUp({ email: "mama@example.com", password: "secret1" });
    const household = await owner.rpc("bootstrap_household");
    const invite = await owner
      .from("invites")
      .select("code")
      .eq("household_id", household.data)
      .is("redeemed_at", null)
      .maybeSingle();
    await owner.auth.signOut();

    const partner = createLocalClient(storage);
    await partner.auth.signUp({ email: "papa@example.com", password: "secret2" });
    const joined = await partner.rpc("join_household", { p_code: (invite.data as { code: string }).code });
    expect(joined.error).toBeNull();
    expect(joined.data).toBe(household.data);
  });

  it("stores a birth date and replaces the weight for the same day", async () => {
    const storage = memoryStorage();
    const client = createLocalClient(storage);
    await client.auth.signUp({ email: "mama@example.com", password: "secret1" });
    const household = await client.rpc("bootstrap_household");
    const baby = await client
      .from("babies")
      .insert({ household_id: household.data, name: "Lola", born_on: "2026-01-15" })
      .select("id, born_on")
      .single();
    expect(baby.data).toMatchObject({ born_on: "2026-01-15" });
    const babyId = (baby.data as { id: string }).id;

    const first = await client
      .from("weights")
      .insert({ household_id: household.data, baby_id: babyId, weighed_on: "2026-10-01", grams: 3400 })
      .select("id, grams")
      .single();
    const replaced = await client
      .from("weights")
      .upsert(
        { household_id: household.data, baby_id: babyId, weighed_on: "2026-10-01", grams: 3500 },
        { onConflict: "baby_id,weighed_on" },
      )
      .select("id, grams")
      .single();
    expect(replaced.error).toBeNull();
    expect(replaced.data).toMatchObject({ id: (first.data as { id: string }).id, grams: 3500 });

    const duplicate = await client
      .from("weights")
      .insert({ household_id: household.data, baby_id: babyId, weighed_on: "2026-10-01", grams: 3600 });
    expect(duplicate.error?.code).toBe("23505");

    const absurd = await client
      .from("weights")
      .insert({ household_id: household.data, baby_id: babyId, weighed_on: "2026-10-02", grams: 0 });
    expect(absurd.error?.code).toBe("23514");

    await client.from("babies").delete().eq("id", babyId);
    const remaining = await client.from("weights").select("id").eq("baby_id", babyId);
    expect(remaining.data).toEqual([]);

    const saved = JSON.parse(storage.getItem("nido-lactancia.local-db") ?? "{}") as { weights?: unknown };
    delete saved.weights;
    storage.setItem("nido-lactancia.local-db", JSON.stringify(saved));
    const reopened = createLocalClient(storage);
    const weights = await reopened.from("weights").select("id");
    expect(weights.error).toBeNull();
    expect(weights.data).toEqual([]);
  });
});
