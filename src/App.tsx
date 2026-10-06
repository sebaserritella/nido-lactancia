import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { es } from "./i18n/es";
import { readSupabaseEnv } from "./lib/env";
import { createLocalClient } from "./lib/localClient";
import { markLocalMode } from "./lib/localMode";
import { createAppClient } from "./lib/supabaseClient";
import { recoveryLinkState, type RecoveryLinkState } from "./lib/passwordRecovery";
import { openingState, rememberHousehold } from "./lib/resume";
import { AuthScreen, NewPasswordScreen } from "./screens/AuthScreen";
import { FamilyScreen } from "./screens/FamilyScreen";
import { TrackerScreen } from "./screens/TrackerScreen";

function sessionFor(userId: string | null): Session | null {
  return userId ? ({ user: { id: userId } } as Session) : null;
}

function cachedHousehold(userId: string): string | null {
  const opening = openingState(localStorage, readSupabaseEnv());
  return opening.userId === userId ? opening.householdId : null;
}

export function App() {
  const [opening] = useState(() => openingState(localStorage, readSupabaseEnv()));
  const [recovery, setRecovery] = useState<RecoveryLinkState>(() => recoveryLinkState(window.location.href));
  const client = useMemo(() => {
    const env = readSupabaseEnv();
    if (!env) {
      markLocalMode();
      return createLocalClient();
    }
    return createAppClient(env.url, env.anonKey);
  }, []);
  const [session, setSession] = useState<Session | null>(() => sessionFor(opening.userId));
  const [householdId, setHouseholdId] = useState<string | null>(opening.householdId);
  const [householdReady, setHouseholdReady] = useState(opening.userId === null || opening.householdId !== null);
  const [householdError, setHouseholdError] = useState<string | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!client) return;
    let ignore = false;
    function applySession(next: Session | null) {
      if (!next && openingState(localStorage, readSupabaseEnv()).userId) return;
      setSession(next);
      if (!next) {
        setHouseholdId(null);
        setHouseholdError(null);
        setHouseholdReady(true);
        return;
      }
      const household = cachedHousehold(next.user.id);
      if (household) {
        setHouseholdId(household);
        setHouseholdError(null);
        setHouseholdReady(true);
        return;
      }
      setHouseholdId(null);
      setHouseholdReady(false);
    }
    void client.auth.getSession().then(({ data }) => {
      if (ignore) return;
      applySession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovery("recovery");
      const localSession = event && typeof event === "object" && "user" in event ? (event as Session) : null;
      applySession(next ?? localSession);
    });
    return () => {
      ignore = true;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !session) return;
    const userId = session.user.id;
    let ignore = false;
    void (async () => {
      const existing = await client
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (ignore) return;
      if (existing.error) {
        if (!cachedHousehold(userId)) setHouseholdError(existing.error.message);
        setHouseholdReady(true);
        return;
      }
      if (existing.data?.household_id) {
        setHouseholdError(null);
        setHouseholdId(existing.data.household_id);
        setHouseholdReady(true);
        rememberHousehold(localStorage, userId, existing.data.household_id);
        void client.rpc("accept_email_invite");
        return;
      }
      const accepted = await client.rpc("accept_email_invite");
      if (ignore) return;
      if (!accepted.error && typeof accepted.data === "string") {
        setHouseholdError(null);
        setHouseholdId(accepted.data);
        setHouseholdReady(true);
        rememberHousehold(localStorage, userId, accepted.data);
        return;
      }
      const { data, error } = await client
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (ignore) return;
      if (error) {
        if (!cachedHousehold(userId)) setHouseholdError(error.message);
        setHouseholdReady(true);
        return;
      }
      setHouseholdError(null);
      setHouseholdId(data?.household_id ?? null);
      setHouseholdReady(true);
      if (data?.household_id) rememberHousehold(localStorage, userId, data.household_id);
    })();
    return () => {
      ignore = true;
    };
  }, [client, session]);

  if (session && recovery !== "recovery" && !householdReady) {
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
            .then(({ data }) => {
              const id = data?.household_id ?? null;
              setHouseholdId(id);
              if (id) rememberHousehold(localStorage, session.user.id, id);
            });
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
