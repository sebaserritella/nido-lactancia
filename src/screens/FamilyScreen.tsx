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
    onReady();
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
        <button type="button" disabled={pending} onClick={() => void createFamily()}>
          {es.createFamily}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
