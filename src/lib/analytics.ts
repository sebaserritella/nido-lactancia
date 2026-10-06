const screens = [
  "login",
  "register",
  "forgot_password",
  "new_password",
  "loading",
  "household_error",
  "create_family",
  "today",
  "history",
] as const;

const results = ["ok", "error"] as const;
const sources = ["now", "past", "edit", "new"] as const;
const actions = [
  "sign_up",
  "sign_in",
  "password_reset_requested",
  "password_updated",
  "family_created",
  "baby_created",
  "baby_renamed",
  "caregiver_invited",
  "feed_started",
  "feed_paused",
  "feed_resumed",
  "feed_stopped",
  "feed_logged",
  "diaper_logged",
  "bottle_logged",
  "weight_logged",
] as const;

const resultEvents = new Set<string>([
  "sign_up",
  "sign_in",
  "password_reset_requested",
  "password_updated",
  "family_created",
  "baby_created",
  "baby_renamed",
  "caregiver_invited",
  "feed_started",
  "feed_paused",
  "feed_resumed",
  "feed_stopped",
]);

const savedEvents = new Set<string>(["feed_logged", "diaper_logged", "bottle_logged", "weight_logged"]);

const schema: Record<string, { required: string[]; fields: Record<string, readonly string[]> }> = {
  app_opened: { required: [], fields: {} },
  screen_view: {
    required: ["screen"],
    fields: { screen: screens, babies: ["one", "many"] },
  },
  sign_up: { required: ["result"], fields: { result: results, reason: ["needs_confirmation"] } },
  sign_in: { required: ["result"], fields: { result: results } },
  password_reset_requested: { required: ["result"], fields: { result: results } },
  password_updated: { required: ["result"], fields: { result: results } },
  signed_out: { required: ["screen"], fields: { screen: screens } },
  family_created: { required: ["result"], fields: { result: results } },
  baby_created: { required: ["result"], fields: { result: results } },
  baby_renamed: { required: ["result"], fields: { result: results } },
  caregiver_invited: { required: ["result"], fields: { result: results } },
  feed_started: { required: ["result"], fields: { result: results } },
  feed_paused: { required: ["result"], fields: { result: results } },
  feed_resumed: { required: ["result"], fields: { result: results } },
  feed_stopped: { required: ["result"], fields: { result: results } },
  feed_logged: { required: ["source"], fields: { source: ["past", "edit"] } },
  diaper_logged: { required: ["source"], fields: { source: ["now", "past", "edit"] } },
  bottle_logged: { required: ["source"], fields: { source: sources } },
  weight_logged: { required: ["source"], fields: { source: ["new", "edit"] } },
  save_failed: { required: ["action", "reason"], fields: { action: actions, reason: ["invalid_input", "conflict", "unavailable"] } },
};

type CleanEvent = { name: string; params: Record<string, string> };

export function buildAnalyticsEvent(name: string, props?: Record<string, unknown>): CleanEvent | null {
  const rule = schema[name];
  if (!rule) return null;
  const params: Record<string, string> = {};
  for (const [key, allowed] of Object.entries(rule.fields)) {
    const value = props?.[key];
    if (typeof value !== "string" || !allowed.includes(value)) continue;
    params[key] = value;
  }
  if (rule.required.some((key) => params[key] === undefined)) return null;
  return { name, params };
}

export function failureReason(error?: { code?: string; message?: string } | null): "invalid_input" | "conflict" | "unavailable" {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "23505" || message.includes("already registered") || message.includes("already in a household")) {
    return "conflict";
  }
  if (code === "23514" || message.includes("invalid email") || (message.includes("email address") && message.includes("invalid"))) {
    return "invalid_input";
  }
  return "unavailable";
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (!/^G-[A-Z0-9]+$/.test(measurementId())) return;
  const event = buildAnalyticsEvent(name, props);
  if (!event) return;
  void send(event);
}

export function trackAttempt(
  name: string,
  ok: boolean,
  error?: { code?: string; message?: string } | null,
  extra?: Record<string, unknown>,
): void {
  track(name, { ...extra, result: ok ? "ok" : "error" });
  if (!ok) track("save_failed", { action: name, reason: error ? failureReason(error) : "invalid_input" });
}

export function trackSaved(
  name: string,
  source: string,
  ok: boolean,
  error?: { code?: string; message?: string } | null,
): void {
  if (ok) track(name, { source });
  else track("save_failed", { action: name, reason: error ? failureReason(error) : "invalid_input" });
}

export function trackRejected(name: string): void {
  if (resultEvents.has(name)) track(name, { result: "error" });
  if (resultEvents.has(name) || savedEvents.has(name)) {
    track("save_failed", { action: name, reason: "invalid_input" });
  }
}

function measurementId(): string {
  return import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() ?? "";
}

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let loading: Promise<void> | null = null;

function ensureGtag(id: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (window.gtag) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve) => {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return loading;
}

async function send(event: CleanEvent): Promise<void> {
  const id = measurementId();
  if (!/^G-[A-Z0-9]+$/.test(id)) return;
  await ensureGtag(id);
  window.gtag?.("event", event.name, event.params);
}
