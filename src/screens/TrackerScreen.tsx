import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby } from "../domain";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { HistoryPanel } from "./HistoryPanel";
import { TodayPanel } from "./TodayPanel";

const babyStorageKey = "nido-lactancia.babyId";

type TrackerScreenProps = {
  client: SupabaseClient;
  householdId: string;
  userId: string;
  timeZone: string;
  onSignOut: () => void;
};

export function TrackerScreen({ client, householdId, userId, timeZone, onSignOut }: TrackerScreenProps) {
  const [babies, setBabies] = useState<Baby[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(babyStorageKey));
  const [tab, setTab] = useState<"today" | "history">("today");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const { data, error: loadError } = await client
        .from("babies")
        .select("id, household_id, name")
        .eq("household_id", householdId)
        .order("created_at");
      if (ignore) return;
      if (loadError) {
        setError(messageForError(loadError));
        return;
      }
      const rows = (data ?? []) as Baby[];
      setBabies(rows);
      setSelectedId((current) => {
        if (current && rows.some((baby) => baby.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    }
    void load();
    const channel = client
      .channel(`babies-${householdId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "babies", filter: `household_id=eq.${householdId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [client, householdId]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(babyStorageKey, selectedId);
  }, [selectedId]);

  useEffect(() => {
    let ignore = false;
    async function loadInvite() {
      const { data } = await client
        .from("invites")
        .select("code")
        .eq("household_id", householdId)
        .is("redeemed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ignore) setInvite(data?.code ?? null);
    }
    void loadInvite();
    return () => {
      ignore = true;
    };
  }, [client, householdId]);

  async function addBaby(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data, error: insertError } = await client
      .from("babies")
      .insert({ household_id: householdId, name: trimmed })
      .select("id, household_id, name")
      .single();
    if (insertError || !data) {
      setError(messageForError(insertError ?? { message: "" }));
      return;
    }
    const baby = data as Baby;
    setBabies((current) => [...current, baby]);
    setSelectedId(baby.id);
    setName("");
  }

  async function rename(baby: Baby) {
    const next = window.prompt(es.babyName, baby.name);
    if (!next || next.trim() === "" || next.trim() === baby.name) return;
    const { error: updateError } = await client.from("babies").update({ name: next.trim() }).eq("id", baby.id);
    if (updateError) {
      setError(messageForError(updateError));
      return;
    }
    setBabies((current) => current.map((item) => (item.id === baby.id ? { ...item, name: next.trim() } : item)));
  }

  async function remove(baby: Baby) {
    if (!window.confirm(es.confirmDeleteBaby(baby.name))) return;
    const { error: deleteError } = await client.from("babies").delete().eq("id", baby.id);
    if (deleteError) {
      setError(messageForError(deleteError));
      return;
    }
    setBabies((current) => current.filter((item) => item.id !== baby.id));
    setSelectedId((current) => (current === baby.id ? null : current));
  }

  async function newInvite() {
    const { data, error: inviteError } = await client.rpc("create_invite");
    if (inviteError || typeof data !== "string") {
      setError(messageForError(inviteError ?? { message: "" }));
      return;
    }
    setInvite(data);
  }

  const selected = babies.find((baby) => baby.id === selectedId) ?? null;

  return (
    <main className="shell">
      <header className="topbar">
        <h1>{es.appName}</h1>
        <button type="button" className="ghost" onClick={onSignOut}>
          {es.signOut}
        </button>
      </header>
      <LocalBanner />
      <form className="card inline" onSubmit={addBaby}>
        <input
          aria-label={es.babyName}
          placeholder={es.babyName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">{es.addBaby}</button>
      </form>
      {babies.length > 0 ? (
        <div className="choice">
          {babies.map((baby) => (
            <button
              key={baby.id}
              type="button"
              className={baby.id === selectedId ? "selected" : "ghost"}
              onClick={() => setSelectedId(baby.id)}
            >
              {baby.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{es.noBabies}</p>
      )}
      {selected ? (
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => rename(selected)}>
            {es.rename}
          </button>
          <button type="button" className="ghost" onClick={() => remove(selected)}>
            {es.delete}
          </button>
        </div>
      ) : null}
      <details className="card">
        <summary>{es.inviteTitle}</summary>
        <p className="muted">{es.inviteHelp}</p>
        {invite ? <p className="code">{invite}</p> : null}
        <button type="button" className="ghost" onClick={newInvite}>
          {es.inviteAgain}
        </button>
      </details>
      {error ? <p className="error">{error}</p> : null}
      {selected ? (
        <>
          <nav className="tabs">
            <button type="button" className={tab === "today" ? "selected" : "ghost"} onClick={() => setTab("today")}>
              {es.today}
            </button>
            <button type="button" className={tab === "history" ? "selected" : "ghost"} onClick={() => setTab("history")}>
              {es.history}
            </button>
          </nav>
          {tab === "today" ? (
            <TodayPanel client={client} baby={selected} userId={userId} timeZone={timeZone} />
          ) : (
            <HistoryPanel client={client} baby={selected} timeZone={timeZone} />
          )}
        </>
      ) : null}
    </main>
  );
}
