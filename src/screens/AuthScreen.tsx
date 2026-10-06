import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalBanner } from "../components/LocalBanner";
import { es } from "../i18n/es";
import { track, trackAttempt, trackRejected } from "../lib/analytics";
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

  useEffect(() => {
    const screen = mode === "login" ? "login" : mode === "register" ? "register" : "forgot_password";
    track("screen_view", { screen });
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    let normalizedEmail: string;
    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      setError(es.invalidEmail);
      trackRejected(mode === "forgot" ? "password_reset_requested" : mode === "register" ? "sign_up" : "sign_in");
      return;
    }
    if (mode === "forgot") {
      if (isLocalMode()) {
        setError(es.recoveryLocal);
        trackRejected("password_reset_requested");
        return;
      }
      setPending(true);
      const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: passwordRecoveryRedirect(window.location.href, import.meta.env.BASE_URL),
      });
      setPending(false);
      if (resetError) {
        setError(messageForError(resetError));
        trackAttempt("password_reset_requested", false, resetError);
        return;
      }
      trackAttempt("password_reset_requested", true);
      setInfo(es.resetSent);
      return;
    }
    if (password.length < 6) {
      setError(es.shortPassword);
      trackRejected(mode === "register" ? "sign_up" : "sign_in");
      return;
    }
    setPending(true);
    if (mode === "register") {
      const { data, error: signUpError } = await client.auth.signUp({ email: normalizedEmail, password });
      setPending(false);
      if (signUpError) {
        setError(messageForError(signUpError));
        trackAttempt("sign_up", false, signUpError);
        return;
      }
      if (!data.session) {
        setError(es.confirmEmailOff);
        track("sign_up", { result: "ok", reason: "needs_confirmation" });
        return;
      }
      trackAttempt("sign_up", true);
      return;
    }
    const { error: signInError } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
    setPending(false);
    if (signInError) {
      setError(messageForError(signInError));
      trackAttempt("sign_in", false, signInError);
      return;
    }
    trackAttempt("sign_in", true);
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
      trackRejected("password_updated");
      return;
    }
    if (password !== confirm) {
      setError(es.passwordsDiffer);
      trackRejected("password_updated");
      return;
    }
    setPending(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(messageForError(updateError));
      trackAttempt("password_updated", false, updateError);
      return;
    }
    trackAttempt("password_updated", true);
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
        <button
          type="button"
          className="ghost"
          onClick={() => {
            track("signed_out", { screen: "new_password" });
            void client.auth.signOut().then(onDone);
          }}
        >
          {es.cancel}
        </button>
      </form>
    </main>
  );
}
