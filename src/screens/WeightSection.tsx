import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby, Weight } from "../domain";
import { es } from "../i18n/es";
import { formatCalendarDate } from "../lib/age";
import { messageForError } from "../lib/errors";
import { trackRejected, trackSaved } from "../lib/analytics";
import { centimetersToMillimeters, formatCentimeters } from "../lib/length";
import { todayLocalDate } from "../lib/localTime";
import { formatKilograms, kilogramsToGrams } from "../lib/weight";

type WeightSectionProps = {
  client: SupabaseClient;
  baby: Baby;
  timeZone: string;
};

const weightColumns = "id, household_id, baby_id, weighed_on, grams, length_mm";

export function WeightSection({ client, baby, timeZone }: WeightSectionProps) {
  const [weights, setWeights] = useState<Weight[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const { data, error: loadError } = await client
        .from("weights")
        .select(weightColumns)
        .eq("baby_id", baby.id)
        .order("weighed_on", { ascending: false });
      if (ignore) return;
      if (loadError) {
        setError(messageForError(loadError));
        return;
      }
      setWeights((data ?? []) as Weight[]);
    }
    void load();
    const channel = client
      .channel(`weights-${baby.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weights", filter: `baby_id=eq.${baby.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [baby.id, client, tick]);

  async function save(weighedOn: string, kgText: string, cmText: string, previousId?: string) {
    const kgTrimmed = kgText.trim();
    const cmTrimmed = cmText.trim();
    if (!kgTrimmed && !cmTrimmed) {
      setError(es.needWeightOrLength);
      trackRejected("weight_logged");
      return;
    }
    let grams: number | null = null;
    if (kgTrimmed) {
      grams = kilogramsToGrams(kgTrimmed);
      if (grams === null) {
        setError(es.invalidWeight);
        trackRejected("weight_logged");
        return;
      }
    }
    let lengthMm: number | null = null;
    if (cmTrimmed) {
      lengthMm = centimetersToMillimeters(cmTrimmed);
      if (lengthMm === null) {
        setError(es.invalidLength);
        trackRejected("weight_logged");
        return;
      }
    }
    setError(null);
    const { data, error: writeError } = await client
      .from("weights")
      .upsert(
        {
          household_id: baby.household_id,
          baby_id: baby.id,
          weighed_on: weighedOn,
          grams,
          length_mm: lengthMm,
        },
        { onConflict: "baby_id,weighed_on" },
      )
      .select(weightColumns)
      .single();
    if (writeError || !data) {
      setError(messageForError(writeError ?? { message: "" }));
      trackSaved("weight_logged", previousId ? "edit" : "new", false, writeError);
      return;
    }
    const saved = data as Weight;
    trackSaved("weight_logged", previousId ? "edit" : "new", true);
    if (previousId && previousId !== saved.id) {
      const { error: deleteError } = await client.from("weights").delete().eq("id", previousId);
      if (deleteError) {
        setError(messageForError(deleteError));
        return;
      }
    }
    setAdding(false);
    setEditingId(null);
    setTick((value) => value + 1);
  }

  async function remove(id: string) {
    if (!window.confirm(es.confirmDeleteWeight)) return;
    setError(null);
    const { error: deleteError } = await client.from("weights").delete().eq("id", id);
    if (deleteError) {
      setError(messageForError(deleteError));
      return;
    }
    setTick((value) => value + 1);
  }

  const today = todayLocalDate(timeZone);

  return (
    <section className="card stack">
      <h2>{es.weightTitle}</h2>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setAdding((value) => !value);
          setEditingId(null);
        }}
      >
        {es.addWeight}
      </button>
      {adding ? (
        <WeightForm
          initialDate={today}
          initialKg=""
          initialCm=""
          onCancel={() => setAdding(false)}
          onSave={(date, kg, cm) => save(date, kg, cm)}
        />
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {weights.length === 0 ? <p className="muted">{es.noWeights}</p> : null}
      {weights.length > 0 ? (
        <ul className="entries plain">
          {weights.map((weight) => (
            <li key={weight.id}>
              <div className="entry-copy weight-meta">
                <strong>{formatCalendarDate(weight.weighed_on)}</strong>
                <span>
                  {[
                    weight.grams != null ? `${formatKilograms(weight.grams)} ${es.kg}` : null,
                    weight.length_mm != null ? `${formatCentimeters(weight.length_mm)} ${es.cm}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="row-actions">
                <button type="button" className="ghost" onClick={() => setEditingId(weight.id)}>
                  {es.editWeight}
                </button>
                <button type="button" className="ghost" onClick={() => remove(weight.id)}>
                  {es.deleteWeight}
                </button>
              </div>
              {editingId === weight.id ? (
                <WeightForm
                  initialDate={weight.weighed_on}
                  initialKg={weight.grams != null ? formatKilograms(weight.grams) : ""}
                  initialCm={weight.length_mm != null ? formatCentimeters(weight.length_mm) : ""}
                  onCancel={() => setEditingId(null)}
                  onSave={(date, kg, cm) => save(date, kg, cm, weight.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function WeightForm({
  initialDate,
  initialKg,
  initialCm,
  onCancel,
  onSave,
}: {
  initialDate: string;
  initialKg: string;
  initialCm: string;
  onCancel: () => void;
  onSave: (date: string, kg: string, cm: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [kg, setKg] = useState(initialKg);
  const [cm, setCm] = useState(initialCm);

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(date, kg, cm);
      }}
    >
      <label>
        {es.weightDate}
        <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label>
        {es.weightKg}
        <input
          inputMode="decimal"
          placeholder="3,270"
          value={kg}
          onChange={(event) => setKg(event.target.value)}
        />
      </label>
      <label>
        {es.weightCm}
        <input
          inputMode="decimal"
          placeholder="52,5"
          value={cm}
          onChange={(event) => setCm(event.target.value)}
        />
      </label>
      <button type="submit">{es.save}</button>
      <button type="button" className="ghost" onClick={onCancel}>
        {es.cancel}
      </button>
    </form>
  );
}
