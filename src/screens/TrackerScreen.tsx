import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby } from "../domain";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { birthDateIssue, formatBabyAge, formatCalendarDate } from "../lib/age";
import { track, trackAttempt, trackRejected } from "../lib/analytics";
import { messageForError } from "../lib/errors";
import { readSupabaseEnv } from "../lib/env";
import { todayLocalDate } from "../lib/localTime";
import { openingState, rememberBabies, rememberTab, type ResumeTab } from "../lib/resume";
import { FamilyPanel } from "./FamilyPanel";
import { FichaPanel } from "./FichaPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TodayPanel } from "./TodayPanel";

const babyStorageKey = "nido-lactancia.babyId";
const babyColumns =
  "id, household_id, name, born_on, pediatrician_name, pediatrician_phone, blood_type, allergies, health_insurance, health_insurance_card";

function normalizeBaby(row: Baby): Baby {
  return {
    ...row,
    born_on: row.born_on ?? null,
    pediatrician_name: row.pediatrician_name ?? null,
    pediatrician_phone: row.pediatrician_phone ?? null,
    blood_type: row.blood_type ?? null,
    allergies: row.allergies ?? null,
    health_insurance: row.health_insurance ?? null,
    health_insurance_card: row.health_insurance_card ?? null,
  };
}

type TrackerScreenProps = {
  client: SupabaseClient;
  householdId: string;
  userId: string;
  timeZone: string;
  onSignOut: () => void;
  onLeftHousehold: () => void;
};

export function TrackerScreen({
  client,
  householdId,
  userId,
  timeZone,
  onSignOut,
  onLeftHousehold,
}: TrackerScreenProps) {
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
  const [tab, setTab] = useState<ResumeTab>(() => (restored ? stored.tab : "today"));
  const [name, setName] = useState("");
  const [bornOn, setBornOn] = useState("");
  const [familyOpen, setFamilyOpen] = useState(false);
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
        data = ((retry.data ?? []) as Array<{ id: string; household_id: string; name: string }>).map((baby) =>
          normalizeBaby({
            ...baby,
            born_on: null,
            pediatrician_name: null,
            pediatrician_phone: null,
            blood_type: null,
            allergies: null,
            health_insurance: null,
            health_insurance_card: null,
          }),
        );
        loadError = retry.error;
      }
      if (ignore) return;
      if (loadError) {
        setError(messageForError(loadError));
        return;
      }
      const rows = ((data ?? []) as Baby[]).map((baby) => normalizeBaby(baby));
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

  useEffect(() => {
    if (!selectedId) return;
    track("screen_view", { screen: tab, babies: babies.length > 1 ? "many" : "one" });
  }, [babies.length, selectedId, tab]);

  async function addBaby(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const today = todayLocalDate(timeZone);
    const issue = birthDateIssue(bornOn, today, true);
    if (issue) {
      setError(birthMessage(issue));
      trackRejected("baby_created");
      return;
    }
    const { data, error: insertError } = await client
      .from("babies")
      .insert({ household_id: householdId, name: trimmed, born_on: bornOn })
      .select(babyColumns)
      .single();
    if (insertError || !data) {
      setError(messageForError(insertError ?? { message: "" }));
      trackAttempt("baby_created", false, insertError);
      return;
    }
    const baby = normalizeBaby(data as Baby);
    setBabies((current) => [...current, baby]);
    setSelectedId(baby.id);
    setName("");
    setBornOn("");
    setError(null);
    trackAttempt("baby_created", true);
  }

  const selected = babies.find((baby) => baby.id === selectedId) ?? null;

  return (
    <main className="shell">
      <header className="topbar">
        <h1>{es.appName}</h1>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => setFamilyOpen(true)}>
            {es.family}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              track("signed_out", { screen: tab });
              onSignOut();
            }}
          >
            {es.signOut}
          </button>
        </div>
      </header>
      <LocalBanner />
      {familyOpen ? (
        <FamilyPanel
          client={client}
          onLeftHousehold={onLeftHousehold}
          onClose={() => setFamilyOpen(false)}
        />
      ) : (
        <>
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
              <form className="card stack" onSubmit={(event) => void addBaby(event)}>
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
            </>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          {selected ? (
            <>
              <nav className="tabs">
                <button
                  type="button"
                  className={tab === "today" ? "selected" : "ghost"}
                  onClick={() => setTab("today")}
                >
                  {es.today}
                </button>
                <button
                  type="button"
                  className={tab === "history" ? "selected" : "ghost"}
                  onClick={() => setTab("history")}
                >
                  {es.history}
                </button>
                <button
                  type="button"
                  className={tab === "ficha" ? "selected" : "ghost"}
                  onClick={() => setTab("ficha")}
                >
                  {es.familyTabFicha}
                </button>
              </nav>
              {tab === "today" ? (
                <TodayPanel client={client} baby={selected} userId={userId} timeZone={timeZone} />
              ) : tab === "history" ? (
                <HistoryPanel client={client} baby={selected} timeZone={timeZone} />
              ) : (
                <FichaPanel
                  client={client}
                  householdId={householdId}
                  userId={userId}
                  timeZone={timeZone}
                  babies={babies}
                  selected={selected}
                  onBabiesChange={setBabies}
                  onSelectedIdChange={setSelectedId}
                  onError={setError}
                />
              )}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}

function birthMessage(issue: "missing" | "invalid" | "future"): string {
  if (issue === "missing") return es.missingBirth;
  if (issue === "future") return es.futureBirth;
  return es.invalidBirth;
}
