import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { messageForError } from "../lib/errors";
import { normalizeEmail } from "../lib/email";
import { isLocalMode } from "../lib/localMode";
import { passwordRecoveryRedirect } from "../lib/passwordRecovery";

type AuthMode = "login" | "register" | "forgot";

type AuthScreenProps = {
  client: SupabaseClient;
  notice?: string | null;
};

export function AuthScreen({ client, notice = null }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(notice);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    let normalizedEmail: string;
    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      setError(es.invalidEmail);
      return;
    }
    if (mode === "forgot") {
      if (isLocalMode()) {
        setError(es.recoveryLocal);
        return;
      }
      setPending(true);
      const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: passwordRecoveryRedirect(window.location.href, import.meta.env.BASE_URL),
      });
      setPending(false);
      if (resetError) {
        setError(messageForError(resetError));
        return;
      }
      setInfo(es.resetSent);
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
      <form className="card stack" noValidate onSubmit={submit}>
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
        {mode === "forgot" ? null : (
          <label>
            {es.password}
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="muted">{info}</p> : null}
        <button type="submit" disabled={pending}>
          {mode === "login" ? es.login : mode === "register" ? es.register : es.sendReset}
        </button>
        {mode === "login" ? (
          <button type="button" className="ghost" onClick={() => setMode("forgot")}>
            {es.forgotPassword}
          </button>
        ) : null}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setError(null);
            setInfo(null);
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? es.needAccount : es.haveAccount}
        </button>
      </form>
    </main>
  );
}

type NewPasswordScreenProps = {
  client: SupabaseClient;
  onDone: () => void;
};

export function NewPasswordScreen({ client, onDone }: NewPasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(es.shortPassword);
      return;
    }
    if (password !== confirm) {
      setError(es.passwordsDiffer);
      return;
    }
    setPending(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(messageForError(updateError));
      return;
    }
    onDone();
  }

  return (
    <main className="shell">
      <h1>{es.appName}</h1>
      <form className="card stack" noValidate onSubmit={submit}>
        <label>
          {es.newPassword}
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          {es.confirmPassword}
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {es.savePassword}
        </button>
        <button type="button" className="ghost" onClick={() => void client.auth.signOut().then(onDone)}>
          {es.cancel}
        </button>
      </form>
    </main>
  );
}
