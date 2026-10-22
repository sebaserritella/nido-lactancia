import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { track, trackAttempt } from "../lib/analytics";
import { messageForError } from "../lib/errors";

type FamilyScreenProps = {
  client: SupabaseClient;
  onSignOut: () => void;
  onReady: () => void;
};

export function FamilyScreen({ client, onSignOut, onReady }: FamilyScreenProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createFamily() {
    setPending(true);
    setError(null);
    const { data, error: createError } = await client.rpc("bootstrap_household");
    if (createError || typeof data !== "string") {
      setPending(false);
      setError(messageForError(createError ?? { message: "" }));
      trackAttempt("family_created", false, createError);
      return;
    }
    trackAttempt("family_created", true);
    onReady();
  }

  async function joinWithCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error: joinError } = await client.rpc("join_household", { p_code: code.trim() });
    setPending(false);
    if (joinError) {
      setError(messageForError(joinError));
      trackAttempt("household_joined", false, joinError);
      return;
    }
    trackAttempt("household_joined", true);
    onReady();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <h1>{es.appName}</h1>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            track("signed_out", { screen: "create_family" });
            onSignOut();
          }}
        >
          {es.signOut}
        </button>
      </header>
      <LocalBanner />
      <section className="card stack">
        <button type="button" disabled={pending} onClick={() => void createFamily()}>
          {es.createFamily}
        </button>
        <form className="stack" noValidate onSubmit={joinWithCode}>
          <p className="muted">{es.joinWithCode}</p>
          <label>
            {es.joinCodeLabel}
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="submit" disabled={code.trim() === "" || pending}>
            {es.joinCodeSubmit}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
