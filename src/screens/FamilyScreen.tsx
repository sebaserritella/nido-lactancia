import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { messageForError } from "../lib/errors";

type FamilyScreenProps = {
  client: SupabaseClient;
  onSignOut: () => void;
  onReady: () => void;
};

export function FamilyScreen({ client, onSignOut, onReady }: FamilyScreenProps) {
  const [mode, setMode] = useState<"choose" | "join" | "code">("choose");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createFamily() {
    setPending(true);
    setError(null);
    const { data, error: createError } = await client.rpc("bootstrap_household");
    if (createError || typeof data !== "string") {
      setPending(false);
      setError(messageForError(createError ?? { message: "" }));
      return;
    }
    const { data: row } = await client
      .from("invites")
      .select("code")
      .eq("household_id", data)
      .is("redeemed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInvite(row?.code ?? null);
    setMode("code");
    setPending(false);
  }

  async function join() {
    setPending(true);
    setError(null);
    const { error: joinError } = await client.rpc("join_household", { p_code: code.trim() });
    setPending(false);
    if (joinError) {
      setError(messageForError(joinError));
      return;
    }
    onReady();
  }

  async function copyCode() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
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
      <section className="card stack">
        {mode === "choose" ? (
          <>
            <button type="button" disabled={pending} onClick={createFamily}>
              {es.createFamily}
            </button>
            <button type="button" className="ghost" onClick={() => setMode("join")}>
              {es.haveCode}
            </button>
          </>
        ) : null}
        {mode === "join" ? (
          <>
            <label>
              {es.inviteCode}
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder={es.codePlaceholder} />
            </label>
            <button type="button" disabled={pending || code.trim() === ""} onClick={join}>
              {es.join}
            </button>
            <button type="button" className="ghost" onClick={() => setMode("choose")}>
              {es.cancel}
            </button>
          </>
        ) : null}
        {mode === "code" ? (
          <>
            <p>{es.inviteHelp}</p>
            <p className="code">{invite}</p>
            <button type="button" className="ghost" onClick={copyCode}>
              {copied ? es.copied : es.copy}
            </button>
            <button type="button" onClick={onReady}>
              {es.continue}
            </button>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
