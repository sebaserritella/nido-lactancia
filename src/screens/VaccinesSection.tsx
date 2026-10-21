import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby, BabyVaccination, VaccineCatalogItem } from "../domain";
import { es } from "../i18n/es";
import { formatCalendarDate } from "../lib/age";
import { messageForError } from "../lib/errors";
import { todayLocalDate } from "../lib/localTime";
import {
  customVaccineRows,
  isFutureDate,
  mergeVaccineRows,
  vaccineTitle,
  visibleStagesForBaby,
  type CatalogMergedVaccine,
  type MergedVaccine,
} from "../lib/vaccines";

const catalogColumns = "id, code, name, life_stage, due_label, sort_order, active";
const vaccinationColumns =
  "id, baby_id, catalog_id, display_name, custom_name, status, given_on, lot_number";

type CustomMergedVaccine = Extract<MergedVaccine, { kind: "custom" }>;

type VaccinesSectionProps = {
  client: SupabaseClient;
  baby: Baby;
  userId: string;
  timeZone: string;
};

export function VaccinesSection({ client, baby, userId, timeZone }: VaccinesSectionProps) {
  const [catalogItems, setCatalogItems] = useState<CatalogMergedVaccine[]>([]);
  const [customItems, setCustomItems] = useState<CustomMergedVaccine[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);
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
      const rows = (rowsResult.data ?? []) as BabyVaccination[];
      setCatalogItems(
        mergeVaccineRows((catalogResult.data ?? []) as VaccineCatalogItem[], rows, nextStages),
      );
      setCustomItems(customVaccineRows(rows) as CustomMergedVaccine[]);
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

  async function saveCatalog(
    item: CatalogMergedVaccine,
    status: "pending" | "done",
    givenOn: string,
    lot: string,
    displayName: string,
  ) {
    const today = todayLocalDate(timeZone);
    if (givenOn && isFutureDate(givenOn, today)) {
      setError(es.vaccineFutureDate);
      return;
    }
    setError(null);
    const payload = {
      baby_id: baby.id,
      catalog_id: item.catalog.id,
      custom_name: null,
      display_name: displayName.trim() || null,
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
    setEditingId(null);
    setTick((value) => value + 1);
  }

  async function saveCustom(
    name: string,
    status: "pending" | "done",
    givenOn: string,
    lot: string,
    previousId?: string,
  ) {
    const today = todayLocalDate(timeZone);
    if (givenOn && isFutureDate(givenOn, today)) {
      setError(es.vaccineFutureDate);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError(es.vaccineNeedCustomName);
      return;
    }
    setError(null);
    const payload = {
      baby_id: baby.id,
      catalog_id: null,
      display_name: null,
      custom_name: trimmed,
      status,
      given_on: givenOn || null,
      lot_number: lot.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    const write = previousId
      ? await client.from("baby_vaccinations").update(payload).eq("id", previousId)
      : await client.from("baby_vaccinations").insert(payload);
    if (write.error) {
      setError(messageForError(write.error));
      setTick((value) => value + 1);
      return;
    }
    setAddingCustom(false);
    setEditingId(null);
    setTick((value) => value + 1);
  }

  async function removeCustom(rowId: string) {
    if (!window.confirm(es.confirmDeleteCustomVaccine)) return;
    setError(null);
    const { error: deleteError } = await client.from("baby_vaccinations").delete().eq("id", rowId);
    if (deleteError) {
      setError(messageForError(deleteError));
      return;
    }
    if (editingId === rowId) setEditingId(null);
    setTick((value) => value + 1);
  }

  const today = todayLocalDate(timeZone);
  const grouped = (
    [
      {
        key: "pending",
        title: es.vaccinePendingGroup,
        rows: catalogItems.filter((item) => item.status !== "done"),
      },
      {
        key: "done",
        title: es.vaccineDoneGroup,
        rows: catalogItems.filter((item) => item.status === "done"),
      },
      { key: "other", title: es.vaccineOtherGroup, rows: customItems },
    ] as const
  ).filter((group) => group.rows.length > 0);

  return (
    <section className="card stack vaccines">
      <h2>
        {es.vaccines} · {baby.name}
      </h2>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setAddingCustom((value) => !value);
          setEditingId(null);
        }}
      >
        {es.vaccineAddCustom}
      </button>
      {addingCustom ? (
        <CustomVaccineForm
          today={today}
          initialName=""
          initialStatus="pending"
          initialGivenOn=""
          initialLot=""
          onCancel={() => setAddingCustom(false)}
          onSave={(name, status, givenOn, lot) => saveCustom(name, status, givenOn, lot)}
        />
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {grouped.map((group) => (
        <div key={group.key} className="vaccine-stage stack">
          <h3 className="vaccine-stage-title">{group.title}</h3>
          <ul className="entries plain vaccine-list">
            {group.rows.map((item) => {
              if (item.kind === "catalog") {
                const open = editingId === item.catalog.id;
                return (
                  <li key={item.catalog.id}>
                    <button
                      type="button"
                      className="vaccine-row"
                      onClick={() => {
                        setEditingId(open ? null : item.catalog.id);
                        setAddingCustom(false);
                      }}
                    >
                      <div className="entry-copy weight-meta">
                        <strong>{vaccineTitle(item)}</strong>
                        <span className="muted">{item.catalog.due_label}</span>
                        {item.status === "done" ? (
                          <span className="vaccine-meta">{doneMeta(item)}</span>
                        ) : null}
                      </div>
                      <span
                        className={
                          item.status === "done"
                            ? "vaccine-badge vaccine-badge-done"
                            : "vaccine-badge vaccine-badge-pending"
                        }
                      >
                        {item.status === "done" ? es.vaccineDone : es.vaccinePending}
                      </span>
                    </button>
                    {open ? (
                      <VaccineForm
                        item={item}
                        today={today}
                        onCancel={() => setEditingId(null)}
                        onSave={(status, givenOn, lot, displayName) =>
                          saveCatalog(item, status, givenOn, lot, displayName)
                        }
                      />
                    ) : null}
                  </li>
                );
              }

              const open = editingId === item.rowId;
              return (
                <li key={item.rowId}>
                  <button
                    type="button"
                    className="vaccine-row"
                    onClick={() => {
                      setEditingId(open ? null : item.rowId);
                      setAddingCustom(false);
                    }}
                  >
                    <div className="entry-copy weight-meta">
                      <strong>{vaccineTitle(item)}</strong>
                      {item.status === "done" ? (
                        <span className="vaccine-meta">{doneMeta(item)}</span>
                      ) : null}
                    </div>
                    <span
                      className={
                        item.status === "done"
                          ? "vaccine-badge vaccine-badge-done"
                          : "vaccine-badge vaccine-badge-pending"
                      }
                    >
                      {item.status === "done" ? es.vaccineDone : es.vaccinePending}
                    </span>
                  </button>
                  {open ? (
                    <CustomVaccineForm
                      today={today}
                      initialName={item.customName}
                      initialStatus={item.status}
                      initialGivenOn={item.given_on ?? ""}
                      initialLot={item.lot_number ?? ""}
                      onCancel={() => setEditingId(null)}
                      onSave={(name, status, givenOn, lot) =>
                        saveCustom(name, status, givenOn, lot, item.rowId)
                      }
                      onDelete={() => void removeCustom(item.rowId)}
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
  item: CatalogMergedVaccine;
  today: string;
  onCancel: () => void;
  onSave: (
    status: "pending" | "done",
    givenOn: string,
    lot: string,
    displayName: string,
  ) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<"pending" | "done">(item.status);
  const [givenOn, setGivenOn] = useState(item.given_on ?? "");
  const [lot, setLot] = useState(item.lot_number ?? "");
  const [displayName, setDisplayName] = useState(item.displayName ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(status, givenOn, lot, displayName);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack vaccines-form" onSubmit={(event) => void submit(event)}>
      <StatusSegment status={status} saving={saving} onChange={setStatus} />
      <label>
        {es.vaccineCarnetName} <span className="muted">{es.vaccineOptional}</span>
        <input
          type="text"
          value={displayName}
          disabled={saving}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <DateAndLotFields
        today={today}
        givenOn={givenOn}
        lot={lot}
        saving={saving}
        onGivenOnChange={setGivenOn}
        onLotChange={setLot}
      />
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

function CustomVaccineForm({
  today,
  initialName,
  initialStatus,
  initialGivenOn,
  initialLot,
  onCancel,
  onSave,
  onDelete,
}: {
  today: string;
  initialName: string;
  initialStatus: "pending" | "done";
  initialGivenOn: string;
  initialLot: string;
  onCancel: () => void;
  onSave: (
    name: string,
    status: "pending" | "done",
    givenOn: string,
    lot: string,
  ) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"pending" | "done">(initialStatus);
  const [givenOn, setGivenOn] = useState(initialGivenOn);
  const [lot, setLot] = useState(initialLot);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(name, status, givenOn, lot);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack vaccines-form" onSubmit={(event) => void submit(event)}>
      <label>
        {es.vaccineCustomName}
        <input
          type="text"
          value={name}
          required
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <StatusSegment status={status} saving={saving} onChange={setStatus} />
      <DateAndLotFields
        today={today}
        givenOn={givenOn}
        lot={lot}
        saving={saving}
        onGivenOnChange={setGivenOn}
        onLotChange={setLot}
      />
      <div className="row-actions">
        <button type="submit" disabled={saving}>
          {es.vaccineSaveDone}
        </button>
        <button type="button" className="ghost" disabled={saving} onClick={onCancel}>
          {es.cancel}
        </button>
        {onDelete ? (
          <button type="button" className="ghost" disabled={saving} onClick={onDelete}>
            {es.vaccineDeleteCustom}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function StatusSegment({
  status,
  saving,
  onChange,
}: {
  status: "pending" | "done";
  saving: boolean;
  onChange: (status: "pending" | "done") => void;
}) {
  return (
    <div className="segment" role="radiogroup" aria-label={es.vaccines}>
      <button
        type="button"
        className={status === "pending" ? "selected" : "ghost"}
        aria-pressed={status === "pending"}
        disabled={saving}
        onClick={() => onChange("pending")}
      >
        {es.vaccinePending}
      </button>
      <button
        type="button"
        className={status === "done" ? "selected" : "ghost"}
        aria-pressed={status === "done"}
        disabled={saving}
        onClick={() => onChange("done")}
      >
        {es.vaccineDone}
      </button>
    </div>
  );
}

function DateAndLotFields({
  today,
  givenOn,
  lot,
  saving,
  onGivenOnChange,
  onLotChange,
}: {
  today: string;
  givenOn: string;
  lot: string;
  saving: boolean;
  onGivenOnChange: (value: string) => void;
  onLotChange: (value: string) => void;
}) {
  return (
    <>
      <label>
        {es.vaccineGivenOn} <span className="muted">{es.vaccineOptional}</span>
        <input
          type="date"
          max={today}
          value={givenOn}
          disabled={saving}
          onChange={(event) => onGivenOnChange(event.target.value)}
        />
      </label>
      <label>
        {es.vaccineLot} <span className="muted">{es.vaccineOptional}</span>
        <input
          type="text"
          value={lot}
          placeholder="ej. XJ44021"
          disabled={saving}
          onChange={(event) => onLotChange(event.target.value)}
        />
      </label>
    </>
  );
}

function doneMeta(item: Pick<MergedVaccine, "given_on" | "lot_number">): string {
  const parts: string[] = [];
  if (item.given_on) parts.push(formatCalendarDate(item.given_on));
  if (item.lot_number) parts.push(`Lote ${item.lot_number}`);
  if (parts.length === 0) return es.vaccineNoDateLot;
  return parts.join(" · ");
}
