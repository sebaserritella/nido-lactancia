import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby, PediatricVisit } from "../domain";
import { es } from "../i18n/es";
import { formatCalendarDate } from "../lib/age";
import { messageForError } from "../lib/errors";
import { centimetersToMillimeters, formatCentimeters } from "../lib/length";
import { todayLocalDate } from "../lib/localTime";
import { isFutureDate } from "../lib/vaccines";
import { formatKilograms, kilogramsToGrams } from "../lib/weight";

const visitColumns = "id, baby_id, visited_on, reason, notes, grams, length_mm";

type VisitsSectionProps = {
  client: SupabaseClient;
  baby: Baby;
  userId: string;
  timeZone: string;
};

export function VisitsSection({ client, baby, userId, timeZone }: VisitsSectionProps) {
  const [visits, setVisits] = useState<PediatricVisit[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const { data, error: loadError } = await client
        .from("pediatric_visits")
        .select(visitColumns)
        .eq("baby_id", baby.id)
        .order("visited_on", { ascending: false });
      if (ignore) return;
      if (loadError) {
        setError(messageForError(loadError));
        return;
      }
      setVisits((data ?? []) as PediatricVisit[]);
      setError(null);
    }
    void load();
    const channel = client
      .channel(`visits-${baby.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pediatric_visits", filter: `baby_id=eq.${baby.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [baby.id, client, tick]);

  async function save(
    visitedOn: string,
    reasonText: string,
    kgText: string,
    cmText: string,
    notesText: string,
    previousId?: string,
  ) {
    const today = todayLocalDate(timeZone);
    if (isFutureDate(visitedOn, today)) {
      setError(es.vaccineFutureDate);
      return;
    }
    const reason = reasonText.trim();
    if (!reason) {
      setError(es.visitNeedReason);
      return;
    }

    const kgTrimmed = kgText.trim();
    const cmTrimmed = cmText.trim();
    let grams: number | null = null;
    let lengthMm: number | null = null;
    if (kgTrimmed || cmTrimmed) {
      if (kgTrimmed) {
        grams = kilogramsToGrams(kgTrimmed);
        if (grams === null) {
          setError(es.invalidWeight);
          return;
        }
      }
      if (cmTrimmed) {
        lengthMm = centimetersToMillimeters(cmTrimmed);
        if (lengthMm === null) {
          setError(es.invalidLength);
          return;
        }
      }
    }

    const notesTrimmed = notesText.trim();
    const notes = notesTrimmed === "" ? null : notesTrimmed;
    const payload = {
      baby_id: baby.id,
      visited_on: visitedOn,
      reason,
      notes,
      grams,
      length_mm: lengthMm,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    setError(null);
    const write = previousId
      ? await client.from("pediatric_visits").update(payload).eq("id", previousId).select(visitColumns).single()
      : await client.from("pediatric_visits").insert(payload).select(visitColumns).single();
    if (write.error || !write.data) {
      setError(messageForError(write.error ?? { message: "" }));
      setTick((value) => value + 1);
      return;
    }

    if (grams != null || lengthMm != null) {
      const { error: weightError } = await client.from("weights").upsert(
        {
          household_id: baby.household_id,
          baby_id: baby.id,
          weighed_on: visitedOn,
          grams,
          length_mm: lengthMm,
        },
        { onConflict: "baby_id,weighed_on" },
      );
      if (weightError) {
        setError(messageForError(weightError));
        setTick((value) => value + 1);
        return;
      }
    }

    setAdding(false);
    setEditingId(null);
    setTick((value) => value + 1);
  }

  async function remove(id: string) {
    if (!window.confirm(es.confirmDeleteVisit)) return;
    setError(null);
    const { error: deleteError } = await client.from("pediatric_visits").delete().eq("id", id);
    if (deleteError) {
      setError(messageForError(deleteError));
      return;
    }
    if (editingId === id) setEditingId(null);
    setTick((value) => value + 1);
  }

  const today = todayLocalDate(timeZone);

  return (
    <section className="card stack">
      <h2>
        {es.visitsTitle} · {baby.name}
      </h2>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setAdding((value) => !value);
          setEditingId(null);
        }}
      >
        {es.addVisit}
      </button>
      {adding ? (
        <VisitForm
          today={today}
          initialDate={today}
          initialReason=""
          initialKg=""
          initialCm=""
          initialNotes=""
          onCancel={() => setAdding(false)}
          onSave={(date, reason, kg, cm, notes) => save(date, reason, kg, cm, notes)}
        />
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {visits.length === 0 ? <p className="muted">{es.noVisits}</p> : null}
      {visits.length > 0 ? (
        <ul className="entries plain">
          {visits.map((visit) => (
            <li key={visit.id}>
              <div className="entry-copy weight-meta">
                <strong>{formatCalendarDate(visit.visited_on)}</strong>
                <span>{visit.reason}</span>
                {visitMeta(visit) ? <span className="muted">{visitMeta(visit)}</span> : null}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditingId(visit.id);
                    setAdding(false);
                  }}
                >
                  {es.editVisit}
                </button>
                <button type="button" className="ghost" onClick={() => void remove(visit.id)}>
                  {es.deleteVisit}
                </button>
              </div>
              {editingId === visit.id ? (
                <VisitForm
                  today={today}
                  initialDate={visit.visited_on}
                  initialReason={visit.reason}
                  initialKg={visit.grams != null ? formatKilograms(visit.grams) : ""}
                  initialCm={visit.length_mm != null ? formatCentimeters(visit.length_mm) : ""}
                  initialNotes={visit.notes ?? ""}
                  onCancel={() => setEditingId(null)}
                  onSave={(date, reason, kg, cm, notes) => save(date, reason, kg, cm, notes, visit.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function visitMeta(visit: PediatricVisit): string | null {
  const parts = [
    visit.grams != null ? `${formatKilograms(visit.grams)} ${es.kg}` : null,
    visit.length_mm != null ? `${formatCentimeters(visit.length_mm)} ${es.cm}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function VisitForm({
  today,
  initialDate,
  initialReason,
  initialKg,
  initialCm,
  initialNotes,
  onCancel,
  onSave,
}: {
  today: string;
  initialDate: string;
  initialReason: string;
  initialKg: string;
  initialCm: string;
  initialNotes: string;
  onCancel: () => void;
  onSave: (date: string, reason: string, kg: string, cm: string, notes: string) => void | Promise<void>;
}) {
  const [date, setDate] = useState(initialDate);
  const [reason, setReason] = useState(initialReason);
  const [kg, setKg] = useState(initialKg);
  const [cm, setCm] = useState(initialCm);
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(date, reason, kg, cm, notes);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <label>
        {es.visitDate}
        <input
          required
          type="date"
          max={today}
          value={date}
          disabled={saving}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label>
        {es.visitReason}
        <input
          required
          value={reason}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label>
        {es.weightKg} <span className="muted">{es.vaccineOptional}</span>
        <input
          inputMode="decimal"
          placeholder="3,270"
          value={kg}
          disabled={saving}
          onChange={(event) => setKg(event.target.value)}
        />
      </label>
      <label>
        {es.weightCm} <span className="muted">{es.vaccineOptional}</span>
        <input
          inputMode="decimal"
          placeholder="52,5"
          value={cm}
          disabled={saving}
          onChange={(event) => setCm(event.target.value)}
        />
      </label>
      <label>
        {es.visitNotes} <span className="muted">{es.vaccineOptional}</span>
        <input value={notes} disabled={saving} onChange={(event) => setNotes(event.target.value)} />
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
