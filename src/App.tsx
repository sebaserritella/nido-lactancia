import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { es } from "./i18n/es";
import { readSupabaseEnv } from "./lib/env";
import { createLocalClient } from "./lib/localClient";
import { markLocalMode } from "./lib/localMode";
import { createAppClient } from "./lib/supabaseClient";
import { AuthScreen } from "./screens/AuthScreen";
import { FamilyScreen } from "./screens/FamilyScreen";
import { TrackerScreen } from "./screens/TrackerScreen";

export function App() {
  const client = useMemo(() => {
    const env = readSupabaseEnv();
    if (!env) {
      markLocalMode();
      return createLocalClient();
    }
    return createAppClient(env.url, env.anonKey);
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdReady, setHouseholdReady] = useState(false);
  const [householdError, setHouseholdError] = useState<string | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!client) return;
    let ignore = false;
    void client.auth.getSession().then(({ data }) => {
      if (ignore) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      ignore = true;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !session) {
      setHouseholdId(null);
      setHouseholdError(null);
      setHouseholdReady(true);
      return;
    }
    let ignore = false;
    setHouseholdReady(false);
    void client
      .from("household_members")
      .select("household_id")
      .maybeSingle()
      .then(({ data, error }) => {
        if (ignore) return;
        setHouseholdError(error?.message ?? null);
        setHouseholdId(data?.household_id ?? null);
        setHouseholdReady(true);
      });
    return () => {
      ignore = true;
    };
  }, [client, session]);

  if (!ready || (session && !householdReady)) {
    return (
      <main className="shell">
        <p>{es.loading}</p>
      </main>
    );
  }
  if (session && householdError) {
    return (
      <main className="shell">
        <h1>{es.appName}</h1>
        <p className="error">{householdError}</p>
        <button type="button" className="ghost" onClick={() => void client.auth.signOut()}>
          {es.signOut}
        </button>
      </main>
    );
  }
  if (!session) return <AuthScreen client={client} />;
  if (!householdId) {
    return (
      <FamilyScreen
        client={client}
        onSignOut={() => void client.auth.signOut()}
        onReady={() => {
          void client
            .from("household_members")
            .select("household_id")
            .maybeSingle()
            .then(({ data }) => setHouseholdId(data?.household_id ?? null));
        }}
      />
    );
  }
  return (
    <TrackerScreen
      client={client}
      householdId={householdId}
      userId={session.user.id}
      timeZone={timeZone}
      onSignOut={() => void client.auth.signOut()}
    />
  );
}
