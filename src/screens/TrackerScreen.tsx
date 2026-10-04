import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby } from "../domain";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { birthDateIssue, formatBabyAge, formatCalendarDate } from "../lib/age";
import { messageForError } from "../lib/errors";
import { todayLocalDate } from "../lib/localTime";
import { HistoryPanel } from "./HistoryPanel";
import { TodayPanel } from "./TodayPanel";

const babyStorageKey = "nido-lactancia.babyId";
const babyColumns = "id, household_id, name, born_on";

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
  const [bornOn, setBornOn] = useState("");
  const [editingBaby, setEditingBaby] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBornOn, setEditBornOn] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      let { data, error: loadError } = await client
        .from("babies")
        .select(babyColumns)
        .eq("household_id", householdId)
        .order("created_at");
      if (loadError && (loadError.message ?? "").includes("born_on")) {
        const retry = await client
          .from("babies")
          .select("id, household_id, name")
          .eq("household_id", householdId)
          .order("created_at");
        data = ((retry.data ?? []) as Array<{ id: string; household_id: string; name: string }>).map((baby) => ({
          ...baby,
          born_on: null,
        }));
        loadError = retry.error;
      }
      if (ignore) return;
      if (loadError) {
        setError(messageForError(loadError));
        return;
      }
      const rows = ((data ?? []) as Baby[]).map((baby) => ({ ...baby, born_on: baby.born_on ?? null }));
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
    setEditingBaby(false);
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
    const today = todayLocalDate(timeZone);
    const issue = birthDateIssue(bornOn, today, true);
    if (issue) {
      setError(birthMessage(issue));
      return;
    }
    const { data, error: insertError } = await client
      .from("babies")
      .insert({ household_id: householdId, name: trimmed, born_on: bornOn })
      .select(babyColumns)
      .single();
    if (insertError || !data) {
      setError(messageForError(insertError ?? { message: "" }));
      return;
    }
    const baby = { ...(data as Baby), born_on: (data as Baby).born_on ?? null };
    setBabies((current) => [...current, baby]);
    setSelectedId(baby.id);
    setName("");
    setBornOn("");
    setError(null);
  }

  function startEdit(baby: Baby) {
    setEditName(baby.name);
    setEditBornOn(baby.born_on ?? "");
    setEditingBaby(true);
    setError(null);
  }

  async function saveBaby(event: FormEvent) {
    event.preventDefault();
    const baby = babies.find((item) => item.id === selectedId);
    if (!baby) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    const today = todayLocalDate(timeZone);
    const issue = birthDateIssue(editBornOn, today, false);
    if (issue) {
      setError(birthMessage(issue));
      return;
    }
    const nextBorn = editBornOn === "" ? null : editBornOn;
    if (trimmed === baby.name && nextBorn === baby.born_on) {
      setEditingBaby(false);
      return;
    }
    const { error: updateError } = await client
      .from("babies")
      .update({ name: trimmed, born_on: nextBorn })
      .eq("id", baby.id);
    if (updateError) {
      setError(messageForError(updateError));
      return;
    }
    setBabies((current) =>
      current.map((item) => (item.id === baby.id ? { ...item, name: trimmed, born_on: nextBorn } : item)),
    );
    setEditingBaby(false);
    setError(null);
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
    setCopied(false);
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
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
      <form className="card stack" onSubmit={addBaby}>
        <label>
          {es.babyName}
          <input
            required
            aria-label={es.babyName}
            placeholder={es.babyName}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {es.bornOn}
          <input
            required
            type="date"
            max={todayLocalDate(timeZone)}
            value={bornOn}
            onChange={(event) => setBornOn(event.target.value)}
          />
        </label>
        <button type="submit">{es.addBaby}</button>
      </form>
      {babies.length > 0 ? (
        <div className="choice">
          {babies.map((baby) => {
            const age = baby.born_on ? formatBabyAge(baby.born_on, todayLocalDate(timeZone)) : null;
            return (
              <button
                key={baby.id}
                type="button"
                className={`${baby.born_on ? "with-meta " : ""}${baby.id === selectedId ? "selected" : "ghost"}`}
                onClick={() => setSelectedId(baby.id)}
              >
                <span>{baby.name}</span>
                {baby.born_on ? (
                  <span className="baby-age">
                    {formatCalendarDate(baby.born_on)}
                    {age ? ` · ${age}` : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">{es.noBabies}</p>
      )}
      {selected && editingBaby ? (
        <form className="card stack" onSubmit={saveBaby}>
          <label>
            {es.babyName}
            <input required value={editName} onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label>
            {es.bornOn}
            <input
              type="date"
              max={todayLocalDate(timeZone)}
              value={editBornOn}
              onChange={(event) => setEditBornOn(event.target.value)}
            />
          </label>
          <button type="submit">{es.save}</button>
          <button type="button" className="ghost" onClick={() => setEditingBaby(false)}>
            {es.cancel}
          </button>
        </form>
      ) : selected ? (
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => startEdit(selected)}>
            {es.rename}
          </button>
          <button type="button" className="ghost" onClick={() => remove(selected)}>
            {es.delete}
          </button>
        </div>
      ) : null}
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
      <div className="stack">
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            aria-expanded={familyOpen}
            onClick={() => setFamilyOpen((open) => !open)}
          >
            {es.family}
          </button>
        </div>
        {familyOpen ? (
          <section className="card stack">
            <h2>{es.inviteTitle}</h2>
            <p className="muted">{es.inviteHelp}</p>
            {invite ? <p className="code">{invite}</p> : null}
            {invite ? (
              <button type="button" className="ghost" onClick={() => void copyInvite()}>
                {copied ? es.copied : es.copy}
              </button>
            ) : null}
            <button type="button" className="ghost" onClick={() => void newInvite()}>
              {es.inviteAgain}
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function birthMessage(issue: "missing" | "invalid" | "future"): string {
  if (issue === "missing") return es.missingBirth;
  if (issue === "future") return es.futureBirth;
  return es.invalidBirth;
}
