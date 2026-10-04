import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { normalizeEmail } from "../lib/email";

type AuthScreenProps = {
  client: SupabaseClient;
};

export function AuthScreen({ client }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let normalizedEmail: string;
    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      setError(es.invalidEmail);
      return;
    }
    if (password.length < 6) {
      setError(es.shortPassword);
      return;
    }
    setPending(true);
    if (mode === "register") {
      const { data, error: signUpError } = await client.auth.signUp({ email: normalizedEmail, password });
      setPending(false);
      if (signUpError) {
        setError(messageForError(signUpError));
        return;
      }
      if (!data.session) {
        setError(es.confirmEmailOff);
      }
      return;
    }
    const { error: signInError } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
    setPending(false);
    if (signInError) {
      setError(messageForError(signInError));
    }
  }

  return (
    <main className="shell">
      <h1>{es.appName}</h1>
      <LocalBanner />
      <form className="card stack" onSubmit={submit}>
        <label>
          {es.email}
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {es.password}
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {mode === "login" ? es.login : es.register}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? es.needAccount : es.haveAccount}
        </button>
      </form>
    </main>
  );
}
