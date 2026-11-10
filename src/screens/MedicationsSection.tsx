import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby, Medication, MedicationDose } from "../domain";
import { es } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { localDateRangeToUtc, todayLocalDate, toDatetimeLocalValue } from "../lib/localTime";

const medicationColumns = "id, baby_id, name, dose, times_per_day";
const doseColumns = "id, medication_id, baby_id, given_at";

type MedicationsSectionProps = {
  client: SupabaseClient;
  baby: Baby;
  userId: string;
  timeZone: string;
};

export function MedicationsSection({ client, baby, userId, timeZone }: MedicationsSectionProps) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doses, setDoses] = useState<MedicationDose[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const today = todayLocalDate(timeZone);
      const range = localDateRangeToUtc(today, today, timeZone);
      const [medicationResult, doseResult] = await Promise.all([
        client.from("medications").select(medicationColumns).eq("baby_id", baby.id).order("name", { ascending: true }),
        client
          .from("medication_doses")
          .select(doseColumns)
          .eq("baby_id", baby.id)
          .gte("given_at", range.startInclusive.toISOString())
          .lt("given_at", range.endExclusive.toISOString())
          .order("given_at", { ascending: true }),
      ]);
      if (ignore) return;
      const failure = medicationResult.error ?? doseResult.error;
      if (failure) {
        setError(messageForError(failure));
        return;
      }
      setMedications((medicationResult.data ?? []) as Medication[]);
      setDoses((doseResult.data ?? []) as MedicationDose[]);
      setError(null);
    }
    void load();
    const channel = client
      .channel(`medications-${baby.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "medications", filter: `baby_id=eq.${baby.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "medication_doses", filter: `baby_id=eq.${baby.id}` }, () => void load())
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [baby.id, client, tick, timeZone]);

  async function save(nameText: string, doseText: string, timesText: string, previousId?: string) {
    const name = nameText.trim();
    if (!name) {
      setError(es.medicationNeedName);
      return;
    }
    const times = Number(timesText);
    if (!Number.isInteger(times) || times < 1 || times > 12) {
      setError(es.medicationInvalidTimes);
      return;
    }
    const dose = doseText.trim() === "" ? null : doseText.trim();
    const payload = {
      baby_id: baby.id,
      name,
      dose,
      times_per_day: times,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    setError(null);
    const write = previousId
      ? await client.from("medications").update(payload).eq("id", previousId)
      : await client.from("medications").insert(payload);
    if (write.error) {
      setError(messageForError(write.error));
      return;
    }
    setAdding(false);
    setEditingId(null);
    setTick((value) => value + 1);
  }

  async function remove(id: string) {
    if (!window.confirm(es.confirmDeleteMedication)) return;
    setError(null);
    const { error: deleteError } = await client.from("medications").delete().eq("id", id);
    if (deleteError) {
      setError(messageForError(deleteError));
      return;
    }
    if (editingId === id) setEditingId(null);
    setTick((value) => value + 1);
  }

  async function give(medication: Medication) {
    setBusyId(medication.id);
    setError(null);
    const { error: writeError } = await client.from("medication_doses").insert({
      medication_id: medication.id,
      baby_id: baby.id,
      given_at: new Date().toISOString(),
      given_by: userId,
    });
    setBusyId(null);
    if (writeError) setError(messageForError(writeError));
    setTick((value) => value + 1);
  }

  async function undo(dose: MedicationDose) {
    setBusyId(dose.medication_id);
    setError(null);
    const { error: deleteError } = await client.from("medication_doses").delete().eq("id", dose.id);
    setBusyId(null);
    if (deleteError) setError(messageForError(deleteError));
    setTick((value) => value + 1);
  }

  return (
    <section className="card stack">
      <h2>{es.medicationsTitle}</h2>
      {medications.length === 0 && !adding ? <p className="muted">{es.noMedications}</p> : null}
      {medications.length > 0 ? (
        <ul className="entries plain">
          {medications.map((medication) => {
            const given = doses.filter((dose) => dose.medication_id === medication.id);
            const last = given[given.length - 1];
            const done = given.length >= medication.times_per_day;
            const status = [
              done ? es.dosesDone : es.dosesToday(given.length, medication.times_per_day),
              last ? es.lastDoseAt(toDatetimeLocalValue(last.given_at, timeZone).slice(11)) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={medication.id}>
                <div className="item-body">
                  <span className="item-title">{medication.name}</span>
                  <div className="chips">
                    {medication.dose ? <span className="chip">{medication.dose}</span> : null}
                    <span className={done ? "chip ok" : "chip accent"}>{status}</span>
                  </div>
                </div>
                <div className="row-actions med-actions">
                  <button
                    type="button"
                    className={done ? "ghost med-give" : "med-give"}
                    disabled={busyId === medication.id}
                    onClick={() => void give(medication)}
                  >
                    {es.giveDose}
                  </button>
                  {last ? (
                    <button type="button" className="ghost" disabled={busyId === medication.id} onClick={() => void undo(last)}>
                      {es.undoDose}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setEditingId(medication.id);
                      setAdding(false);
                    }}
                  >
                    {es.editMedication}
                  </button>
                  <button type="button" className="danger" onClick={() => void remove(medication.id)}>
                    {es.deleteMedication}
                  </button>
                </div>
                {editingId === medication.id ? (
                  <MedicationForm
                    initialName={medication.name}
                    initialDose={medication.dose ?? ""}
                    initialTimes={String(medication.times_per_day)}
                    onCancel={() => setEditingId(null)}
                    onSave={(name, dose, times) => save(name, dose, times, medication.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {adding ? (
        <MedicationForm
          initialName=""
          initialDose=""
          initialTimes="1"
          onCancel={() => setAdding(false)}
          onSave={(name, dose, times) => save(name, dose, times)}
        />
      ) : (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
        >
          {es.addMedication}
        </button>
      )}
    </section>
  );
}

function MedicationForm({
  initialName,
  initialDose,
  initialTimes,
  onCancel,
  onSave,
}: {
  initialName: string;
  initialDose: string;
  initialTimes: string;
  onCancel: () => void;
  onSave: (name: string, dose: string, times: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [dose, setDose] = useState(initialDose);
  const [times, setTimes] = useState(initialTimes);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(name, dose, times);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <label>
        {es.medicationName}
        <input required placeholder="Vitamina D" value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        {es.medicationDose} <span className="muted">{es.vaccineOptional}</span>
        <input placeholder="400 UI · 1 gota" value={dose} disabled={saving} onChange={(event) => setDose(event.target.value)} />
      </label>
      <label>
        {es.medicationTimesPerDay}
        <input
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          step={1}
          value={times}
          disabled={saving}
          onChange={(event) => setTimes(event.target.value)}
        />
      </label>
      <div className="row-actions">
        <button type="submit" disabled={saving}>
          {es.save}
        </button>
        <button type="button" className="ghost" disabled={saving} onClick={onCancel}>
          {es.cancel}
        </button>
      </div>
    </form>
  );
}
