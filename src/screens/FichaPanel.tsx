import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baby } from "../domain";
import { es } from "../i18n/es";
import { birthDateIssue } from "../lib/age";
import { trackAttempt, trackRejected } from "../lib/analytics";
import { messageForError } from "../lib/errors";
import { todayLocalDate } from "../lib/localTime";
import { VaccinesSection } from "./VaccinesSection";

const babyColumns = "id, household_id, name, born_on";

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
  const [name, setName] = useState("");
  const [bornOn, setBornOn] = useState("");
  const [editName, setEditName] = useState("");
  const [editBornOn, setEditBornOn] = useState("");
  const [renameForId, setRenameForId] = useState<string | null>(null);

  if (selected && renameForId !== selected.id) {
    setRenameForId(selected.id);
    setEditName(selected.name);
    setEditBornOn(selected.born_on ?? "");
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
    const baby = { ...(data as Baby), born_on: (data as Baby).born_on ?? null };
    onBabiesChange([...babies, baby]);
    onSelectedIdChange(baby.id);
    setName("");
    setBornOn("");
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
    if (trimmed === selected.name && nextBorn === selected.born_on) return;
    const { error: updateError } = await client
      .from("babies")
      .update({ name: trimmed, born_on: nextBorn })
      .eq("id", selected.id);
    if (updateError) {
      onError(messageForError(updateError));
      trackAttempt("baby_renamed", false, updateError);
      return;
    }
    onBabiesChange(
      babies.map((item) => (item.id === selected.id ? { ...item, name: trimmed, born_on: nextBorn } : item)),
    );
    onError(null);
    trackAttempt("baby_renamed", true);
  }

  return (
    <>
      <section className="card stack">
        {selected ? (
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
            <button type="submit">{es.renameBaby}</button>
          </form>
        ) : null}
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
          <button type="submit">{es.addBaby}</button>
        </form>
      </section>
      {selected ? <VaccinesSection client={client} baby={selected} userId={userId} timeZone={timeZone} /> : null}
    </>
  );
}

function birthMessage(issue: "missing" | "invalid" | "future"): string {
  if (issue === "missing") return es.missingBirth;
  if (issue === "future") return es.futureBirth;
  return es.invalidBirth;
}
