import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby } from "../domain";
import { es } from "../i18n/es";
import { birthDateIssue, formatCalendarDate } from "../lib/age";
import { trackAttempt, trackRejected } from "../lib/analytics";
import { messageForError } from "../lib/errors";
import { todayLocalDate } from "../lib/localTime";
import { whatsappUrl } from "../lib/whatsapp";
import { VaccinesSection } from "./VaccinesSection";
import { VisitsSection } from "./VisitsSection";

const babyColumns =
  "id, household_id, name, born_on, pediatrician_name, pediatrician_phone, blood_type, allergies, health_insurance, health_insurance_card";

type FichaPanelProps = {
  client: SupabaseClient;
  householdId: string;
  userId: string;
  timeZone: string;
  babies: Baby[];
  selected: Baby | null;
  onBabiesChange: (babies: Baby[]) => void;
  onSelectedIdChange: (id: string | null) => void;
  onError: (message: string | null) => void;
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

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

export function FichaPanel({
  client,
  householdId,
  userId,
  timeZone,
  babies,
  selected,
  onBabiesChange,
  onSelectedIdChange,
  onError,
}: FichaPanelProps) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bornOn, setBornOn] = useState("");
  const [editName, setEditName] = useState("");
  const [editBornOn, setEditBornOn] = useState("");
  const [editPediatrician, setEditPediatrician] = useState("");
  const [editPediatricianPhone, setEditPediatricianPhone] = useState("");
  const [editBloodType, setEditBloodType] = useState("");
  const [editAllergies, setEditAllergies] = useState("");
  const [editHealthInsurance, setEditHealthInsurance] = useState("");
  const [editHealthInsuranceCard, setEditHealthInsuranceCard] = useState("");
  const [syncedId, setSyncedId] = useState<string | null>(null);

  if (selected && syncedId !== selected.id) {
    setSyncedId(selected.id);
    setEditing(false);
    syncEditFields(selected);
  }

  function syncEditFields(baby: Baby) {
    setEditName(baby.name);
    setEditBornOn(baby.born_on ?? "");
    setEditPediatrician(baby.pediatrician_name ?? "");
    setEditPediatricianPhone(baby.pediatrician_phone ?? "");
    setEditBloodType(baby.blood_type ?? "");
    setEditAllergies(baby.allergies ?? "");
    setEditHealthInsurance(baby.health_insurance ?? "");
    setEditHealthInsuranceCard(baby.health_insurance_card ?? "");
  }

  function openEdit() {
    if (!selected) return;
    syncEditFields(selected);
    setEditing(true);
    setAdding(false);
  }

  function cancelEdit() {
    if (selected) syncEditFields(selected);
    setEditing(false);
  }

  async function addBaby(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const today = todayLocalDate(timeZone);
    const issue = birthDateIssue(bornOn, today, true);
    if (issue) {
      onError(birthMessage(issue));
      trackRejected("baby_created");
      return;
    }
    const { data, error: insertError } = await client
      .from("babies")
      .insert({ household_id: householdId, name: trimmed, born_on: bornOn })
      .select(babyColumns)
      .single();
    if (insertError || !data) {
      onError(messageForError(insertError ?? { message: "" }));
      trackAttempt("baby_created", false, insertError);
      return;
    }
    const baby = normalizeBaby(data as Baby);
    onBabiesChange([...babies, baby]);
    onSelectedIdChange(baby.id);
    setName("");
    setBornOn("");
    setAdding(false);
    onError(null);
    trackAttempt("baby_created", true);
  }

  async function saveBaby(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    const today = todayLocalDate(timeZone);
    const issue = birthDateIssue(editBornOn, today, false);
    if (issue) {
      onError(birthMessage(issue));
      trackRejected("baby_renamed");
      return;
    }
    const nextBorn = editBornOn === "" ? null : editBornOn;
    const nextProfile = {
      name: trimmed,
      born_on: nextBorn,
      pediatrician_name: emptyToNull(editPediatrician),
      pediatrician_phone: emptyToNull(editPediatricianPhone),
      blood_type: emptyToNull(editBloodType),
      allergies: emptyToNull(editAllergies),
      health_insurance: emptyToNull(editHealthInsurance),
      health_insurance_card: emptyToNull(editHealthInsuranceCard),
    };
    const { error: updateError } = await client.from("babies").update(nextProfile).eq("id", selected.id);
    if (updateError) {
      onError(messageForError(updateError));
      trackAttempt("baby_renamed", false, updateError);
      return;
    }
    onBabiesChange(babies.map((item) => (item.id === selected.id ? { ...item, ...nextProfile } : item)));
    trackAttempt("baby_renamed", true);
    setEditing(false);
    onError(null);
  }

  const pediatricianPhoneTrimmed = selected?.pediatrician_phone?.trim() ?? "";

  function openPediatricianWhatsApp() {
    if (!selected?.pediatrician_phone) return;
    const url = whatsappUrl(selected.pediatrician_phone);
    if (!url) {
      onError(es.invalidPhone);
      return;
    }
    onError(null);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <section className="card stack">
        {selected && !editing ? (
          <div className="stack">
            <div>
              <strong>{selected.name}</strong>
              {selected.born_on ? <p className="muted">{formatCalendarDate(selected.born_on)}</p> : null}
              {selected.pediatrician_name ? (
                <p className="muted">
                  <strong>{es.pediatrician}</strong>: {selected.pediatrician_name}
                </p>
              ) : null}
              {selected.pediatrician_phone ? (
                <p className="muted">
                  <strong>{es.pediatricianPhone}</strong>: {selected.pediatrician_phone}
                </p>
              ) : null}
              {selected.blood_type ? (
                <p className="muted">
                  <strong>{es.bloodType}</strong>: {selected.blood_type}
                </p>
              ) : null}
              {selected.allergies ? (
                <p className="muted">
                  <strong>{es.allergies}</strong>: {selected.allergies}
                </p>
              ) : null}
              {selected.health_insurance ? (
                <p className="muted">
                  <strong>{es.healthInsurance}</strong>: {selected.health_insurance}
                </p>
              ) : null}
              {selected.health_insurance_card ? (
                <p className="muted">
                  <strong>{es.healthInsuranceCard}</strong>: {selected.health_insurance_card}
                </p>
              ) : null}
            </div>
            <div className="row-actions">
              <button type="button" className="ghost" onClick={openEdit}>
                {es.editBaby}
              </button>
              {pediatricianPhoneTrimmed ? (
                <button type="button" className="ghost" onClick={openPediatricianWhatsApp}>
                  {es.openWhatsApp}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {selected && editing ? (
          <form className="stack" onSubmit={(event) => void saveBaby(event)}>
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
            <label>
              {es.pediatrician}
              <input value={editPediatrician} onChange={(event) => setEditPediatrician(event.target.value)} />
            </label>
            <label>
              {es.pediatricianPhone}
              <input
                value={editPediatricianPhone}
                onChange={(event) => setEditPediatricianPhone(event.target.value)}
                inputMode="tel"
              />
            </label>
            <label>
              {es.bloodType}
              <input value={editBloodType} onChange={(event) => setEditBloodType(event.target.value)} />
            </label>
            <label>
              {es.allergies}
              <input value={editAllergies} onChange={(event) => setEditAllergies(event.target.value)} />
            </label>
            <label>
              {es.healthInsurance}
              <input
                value={editHealthInsurance}
                onChange={(event) => setEditHealthInsurance(event.target.value)}
              />
            </label>
            <label>
              {es.healthInsuranceCard}
              <input
                value={editHealthInsuranceCard}
                onChange={(event) => setEditHealthInsuranceCard(event.target.value)}
              />
            </label>
            <div className="row-actions">
              <button type="submit" className="ghost">
                {es.save}
              </button>
              <button type="button" className="ghost" onClick={cancelEdit}>
                {es.cancel}
              </button>
            </div>
          </form>
        ) : null}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setAdding((value) => !value);
            if (!adding) setEditing(false);
            if (adding) {
              setName("");
              setBornOn("");
            }
          }}
        >
          {es.addBaby}
        </button>
        {adding ? (
          <form className="stack" onSubmit={(event) => void addBaby(event)}>
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
            <div className="row-actions">
              <button type="submit">{es.addBaby}</button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setAdding(false);
                  setName("");
                  setBornOn("");
                }}
              >
                {es.cancel}
              </button>
            </div>
          </form>
        ) : null}
      </section>
      {selected ? (
        <VisitsSection client={client} baby={selected} userId={userId} timeZone={timeZone} />
      ) : null}
      {selected ? <VaccinesSection client={client} baby={selected} userId={userId} timeZone={timeZone} /> : null}
    </>
  );
}

function birthMessage(issue: "missing" | "invalid" | "future"): string {
  if (issue === "missing") return es.missingBirth;
  if (issue === "future") return es.futureBirth;
  return es.invalidBirth;
}
