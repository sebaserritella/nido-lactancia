import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby } from "../domain";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { birthDateIssue, formatBabyAge, formatCalendarDate } from "../lib/age";
import { normalizeEmail } from "../lib/email";
import { messageForError } from "../lib/errors";
import { readSupabaseEnv } from "../lib/env";
import { todayLocalDate } from "../lib/localTime";
import { openingState, rememberBabies, rememberTab } from "../lib/resume";
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
  const [stored] = useState(() => openingState(localStorage, readSupabaseEnv()));
  const restored = stored.userId === userId && stored.householdId === householdId;
  const [babies, setBabies] = useState<Baby[]>(() => (restored ? stored.babies : []));
  const [babiesKnown, setBabiesKnown] = useState(restored);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const saved = localStorage.getItem(babyStorageKey);
    if (!restored) return saved;
    if (saved && stored.babies.some((baby) => baby.id === saved)) return saved;
    return stored.babies[0]?.id ?? null;
  });
  const [tab, setTab] = useState<"today" | "history">(() => (restored ? stored.tab : "today"));
  const [name, setName] = useState("");
  const [bornOn, setBornOn] = useState("");
  const [editName, setEditName] = useState("");
  const [editBornOn, setEditBornOn] = useState("");
  const [renameForId, setRenameForId] = useState<string | null>(null);
  const [babiesOpen, setBabiesOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [relativeEmail, setRelativeEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
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
      setBabiesKnown(true);
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
    if (!babiesKnown) return;
    rememberBabies(localStorage, userId, householdId, babies);
  }, [babies, babiesKnown, householdId, userId]);

  useEffect(() => {
    rememberTab(localStorage, userId, tab);
  }, [tab, userId]);

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
    if (trimmed === baby.name && nextBorn === baby.born_on) return;
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
    setError(null);
  }

  async function inviteRelative(event: FormEvent) {
    event.preventDefault();
    setInviteError(null);
    setInviteSent(false);
    let email: string;
    try {
      email = normalizeEmail(relativeEmail);
    } catch {
      setInviteError(es.invalidEmail);
      return;
    }
    setInvitePending(true);
    const { error: sendError } = await client.rpc("invite_by_email", { p_email: email });
    setInvitePending(false);
    if (sendError) {
      setInviteError(messageForError(sendError));
      return;
    }
    setRelativeEmail("");
    setInviteSent(true);
  }

  const selected = babies.find((baby) => baby.id === selectedId) ?? null;
  if (selected && renameForId !== selected.id) {
    setRenameForId(selected.id);
    setEditName(selected.name);
    setEditBornOn(selected.born_on ?? "");
  }

  function addBabyForm(className: string) {
    return (
      <form className={className} onSubmit={addBaby}>
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
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <h1>{es.appName}</h1>
        <button type="button" className="ghost" onClick={onSignOut}>
          {es.signOut}
        </button>
      </header>
      <LocalBanner />
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
      ) : babiesKnown ? (
        <>
          <p className="muted">{es.noBabies}</p>
          {addBabyForm("card stack")}
        </>
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
          {babies.length > 0 ? (
            <button
              type="button"
              className="ghost"
              aria-expanded={babiesOpen}
              onClick={() => setBabiesOpen((open) => !open)}
            >
              {es.babies}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost"
            aria-expanded={familyOpen}
            onClick={() => setFamilyOpen((open) => !open)}
          >
            {es.family}
          </button>
        </div>
        {babiesOpen && babies.length > 0 ? (
          <section className="card stack">
            {selected ? (
              <form className="stack" onSubmit={saveBaby}>
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
                <button type="submit">{es.renameBaby}</button>
              </form>
            ) : null}
            {addBabyForm("stack")}
          </section>
        ) : null}
        {familyOpen ? (
          <section className="card stack">
            <h2>{es.inviteTitle}</h2>
            <form className="stack" onSubmit={(event) => void inviteRelative(event)}>
              <label>
                {es.relativeEmail}
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={relativeEmail}
                  onChange={(event) => {
                    setRelativeEmail(event.target.value);
                    setInviteSent(false);
                  }}
                />
              </label>
              <p className="muted">{es.inviteHelp}</p>
              <button type="submit" disabled={invitePending || relativeEmail.trim() === ""}>
                {es.inviteTitle}
              </button>
            </form>
            {inviteSent ? <p>{es.inviteSent}</p> : null}
            {inviteError ? <p className="error">{inviteError}</p> : null}
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
