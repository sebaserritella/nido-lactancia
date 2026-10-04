import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { es } from "./i18n/es";
import { readSupabaseEnv } from "./lib/env";
import { createLocalClient } from "./lib/localClient";
import { markLocalMode } from "./lib/localMode";
import { createAppClient } from "./lib/supabaseClient";
import { recoveryLinkState, type RecoveryLinkState } from "./lib/passwordRecovery";
import { AuthScreen, NewPasswordScreen } from "./screens/AuthScreen";
import { FamilyScreen } from "./screens/FamilyScreen";
import { TrackerScreen } from "./screens/TrackerScreen";

export function App() {
  const [recovery, setRecovery] = useState<RecoveryLinkState>(() => recoveryLinkState(window.location.href));
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
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovery("recovery");
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
    const userId = session.user.id;
    let ignore = false;
    setHouseholdReady(false);
    void (async () => {
      const existing = await client
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (ignore) return;
      if (existing.data?.household_id) {
        setHouseholdError(null);
        setHouseholdId(existing.data.household_id);
        setHouseholdReady(true);
        void client.rpc("accept_email_invite");
        return;
      }
      const accepted = await client.rpc("accept_email_invite");
      if (ignore) return;
      if (!accepted.error && typeof accepted.data === "string") {
        setHouseholdError(null);
        setHouseholdId(accepted.data);
        setHouseholdReady(true);
        return;
      }
      const { data, error } = await client
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (ignore) return;
      setHouseholdError(error?.message ?? null);
      setHouseholdId(data?.household_id ?? null);
      setHouseholdReady(true);
    })();
    return () => {
      ignore = true;
    };
  }, [client, session]);

  if (!ready || (session && recovery !== "recovery" && !householdReady)) {
    return (
      <main className="shell">
        <p>{es.loading}</p>
      </main>
    );
  }
  if (recovery === "recovery" && session) {
    return <NewPasswordScreen client={client} onDone={() => setRecovery(null)} />;
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
  if (!session) return <AuthScreen client={client} notice={recovery === "expired" ? es.recoveryExpired : null} />;
  if (!householdId) {
    return (
      <FamilyScreen
        client={client}
        onSignOut={() => void client.auth.signOut()}
        onReady={() => {
          void client
            .from("household_members")
            .select("household_id")
            .eq("user_id", session.user.id)
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
