import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby, BabyVaccination, VaccineCatalogItem } from "../domain";
import { es } from "../i18n/es";
import { formatCalendarDate } from "../lib/age";
import { messageForError } from "../lib/errors";
import { todayLocalDate } from "../lib/localTime";
import { isFutureDate, mergeVaccineRows, visibleStagesForBaby, type MergedVaccine } from "../lib/vaccines";

const catalogColumns = "id, code, name, life_stage, due_label, sort_order, active";
const vaccinationColumns = "id, baby_id, catalog_id, status, given_on, lot_number";

type VaccinesSectionProps = {
  client: SupabaseClient;
  baby: Baby;
  userId: string;
  timeZone: string;
};

export function VaccinesSection({ client, baby, userId, timeZone }: VaccinesSectionProps) {
  const [items, setItems] = useState<MergedVaccine[]>([]);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const today = todayLocalDate(timeZone);
      const nextStages = visibleStagesForBaby(baby.born_on, today);
      const [catalogResult, rowsResult] = await Promise.all([
        client.from("vaccine_catalog").select(catalogColumns).eq("active", true),
        client.from("baby_vaccinations").select(vaccinationColumns).eq("baby_id", baby.id),
      ]);
      if (ignore) return;
      if (catalogResult.error) {
        setError(messageForError(catalogResult.error));
        return;
      }
      if (rowsResult.error) {
        setError(messageForError(rowsResult.error));
        return;
      }
      setItems(
        mergeVaccineRows(
          (catalogResult.data ?? []) as VaccineCatalogItem[],
          (rowsResult.data ?? []) as BabyVaccination[],
          nextStages,
        ),
      );
      setError(null);
    }
    void load();
    const channel = client
      .channel(`vaccines-${baby.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "baby_vaccinations", filter: `baby_id=eq.${baby.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      ignore = true;
      void client.removeChannel(channel);
    };
  }, [baby.born_on, baby.id, client, tick, timeZone]);

  async function save(item: MergedVaccine, status: "pending" | "done", givenOn: string, lot: string) {
    const today = todayLocalDate(timeZone);
    if (givenOn && isFutureDate(givenOn, today)) {
      setError(es.vaccineFutureDate);
      return;
    }
    setError(null);
    const payload = {
      baby_id: baby.id,
      catalog_id: item.catalog.id,
      status,
      given_on: givenOn || null,
      lot_number: lot.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    const write = item.rowId
      ? await client.from("baby_vaccinations").update(payload).eq("id", item.rowId)
      : await client.from("baby_vaccinations").insert(payload);
    if (write.error) {
      setError(messageForError(write.error));
      setTick((value) => value + 1);
      return;
    }
    setEditingCatalogId(null);
    setTick((value) => value + 1);
  }

  const grouped = (
    [
      { key: "pending", title: es.vaccinePendingGroup, rows: items.filter((item) => item.status !== "done") },
      { key: "done", title: es.vaccineDoneGroup, rows: items.filter((item) => item.status === "done") },
    ] as const
  ).filter((group) => group.rows.length > 0);

  return (
    <section className="card stack vaccines">
      <h2>
        {es.vaccines} · {baby.name}
      </h2>
      {error ? <p className="error">{error}</p> : null}
      {grouped.map((group) => (
        <div key={group.key} className="vaccine-stage stack">
          <h3 className="vaccine-stage-title">{group.title}</h3>
          <ul className="entries plain vaccine-list">
            {group.rows.map((item) => {
              const open = editingCatalogId === item.catalog.id;
              return (
                <li key={item.catalog.id}>
                  <button
                    type="button"
                    className="vaccine-row"
                    onClick={() => setEditingCatalogId(open ? null : item.catalog.id)}
                  >
                    <div className="entry-copy weight-meta">
                      <strong>{item.catalog.name}</strong>
                      <span className="muted">{item.catalog.due_label}</span>
                      {item.status === "done" ? (
                        <span className="vaccine-meta">{doneMeta(item)}</span>
                      ) : null}
                    </div>
                    <span
                      className={
                        item.status === "done" ? "vaccine-badge vaccine-badge-done" : "vaccine-badge vaccine-badge-pending"
                      }
                    >
                      {item.status === "done" ? es.vaccineDone : es.vaccinePending}
                    </span>
                  </button>
                  {open ? (
                    <VaccineForm
                      item={item}
                      today={todayLocalDate(timeZone)}
                      onCancel={() => setEditingCatalogId(null)}
                      onSave={(status, givenOn, lot) => save(item, status, givenOn, lot)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function VaccineForm({
  item,
  today,
  onCancel,
  onSave,
}: {
  item: MergedVaccine;
  today: string;
  onCancel: () => void;
  onSave: (status: "pending" | "done", givenOn: string, lot: string) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<"pending" | "done">(item.status);
  const [givenOn, setGivenOn] = useState(item.given_on ?? "");
  const [lot, setLot] = useState(item.lot_number ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(status, givenOn, lot);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack vaccines-form" onSubmit={(event) => void submit(event)}>
      <div className="segment" role="radiogroup" aria-label={es.vaccines}>
        <button
          type="button"
          className={status === "pending" ? "selected" : "ghost"}
          aria-pressed={status === "pending"}
          disabled={saving}
          onClick={() => setStatus("pending")}
        >
          {es.vaccinePending}
        </button>
        <button
          type="button"
          className={status === "done" ? "selected" : "ghost"}
          aria-pressed={status === "done"}
          disabled={saving}
          onClick={() => setStatus("done")}
        >
          {es.vaccineDone}
        </button>
      </div>
      <label>
        {es.vaccineGivenOn} <span className="muted">{es.vaccineOptional}</span>
        <input
          type="date"
          max={today}
          value={givenOn}
          disabled={saving}
          onChange={(event) => setGivenOn(event.target.value)}
        />
      </label>
      <label>
        {es.vaccineLot} <span className="muted">{es.vaccineOptional}</span>
        <input
          type="text"
          value={lot}
          placeholder="ej. XJ44021"
          disabled={saving}
          onChange={(event) => setLot(event.target.value)}
        />
      </label>
      <div className="row-actions">
        <button type="submit" disabled={saving}>
          {es.vaccineSaveDone}
        </button>
        <button type="button" className="ghost" disabled={saving} onClick={onCancel}>
          {es.cancel}
        </button>
      </div>
    </form>
  );
}

function doneMeta(item: MergedVaccine): string {
  const parts: string[] = [];
  if (item.given_on) parts.push(formatCalendarDate(item.given_on));
  if (item.lot_number) parts.push(`Lote ${item.lot_number}`);
  if (parts.length === 0) return es.vaccineNoDateLot;
  return parts.join(" · ");
}
