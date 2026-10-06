import type { Baby, DiaperKind, FeedKind, FeedSide } from "../domain";

export const localDbKey = "nido-lactancia.local-db";
export const resumeKey = "nido-lactancia.resume";

export type ResumeTab = "today" | "history";

export type CachedFeed = {
  id: string;
  started_at: string;
  ended_at: string | null;
  paused_ms: number;
  paused_at: string | null;
  side: FeedSide | null;
  kind: FeedKind;
  ml: number | null;
};

export type CachedDiaper = {
  id: string;
  occurred_at: string;
  kind: DiaperKind;
};

export type CachedLatest = {
  feed: CachedFeed | null;
  diaper: CachedDiaper | null;
};

export type Resume = {
  userId: string;
  householdId: string;
  babies: Baby[];
  tab: ResumeTab;
  latest: Record<string, CachedLatest>;
};

export type Opening = {
  userId: string | null;
  householdId: string | null;
  babies: Baby[];
  tab: ResumeTab;
  latest: Record<string, CachedLatest>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const emptyOpening: Opening = {
  userId: null,
  householdId: null,
  babies: [],
  tab: "today",
  latest: {},
};

export function authStorageKey(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  return `sb-${host}-auth-token`;
}

export function openingState(storage: Pick<Storage, "getItem">, env: { url: string } | null): Opening {
  if (!env) return openingFromLocal(storage);
  const userId = readStoredUserId(storage, authStorageKey(env.url));
  if (!userId) return emptyOpening;
  const resume = readResume(storage, userId);
  if (!resume) return { ...emptyOpening, userId };
  return {
    userId,
    householdId: resume.householdId,
    babies: resume.babies.filter((baby) => baby.household_id === resume.householdId),
    tab: resume.tab,
    latest: resume.latest,
  };
}

export function readResume(storage: Pick<Storage, "getItem">, userId: string): Resume | null {
  const raw = storage.getItem(resumeKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Resume>;
    if (parsed.userId !== userId || typeof parsed.householdId !== "string" || parsed.householdId === "") return null;
    const babies = Array.isArray(parsed.babies) ? parsed.babies.filter(isBaby) : [];
    return {
      userId,
      householdId: parsed.householdId,
      babies,
      tab: parsed.tab === "history" ? "history" : "today",
      latest: sanitizeLatest(parsed.latest),
    };
  } catch {
    return null;
  }
}

export function rememberHousehold(storage: StorageLike, userId: string, householdId: string): void {
  const current = readResume(storage, userId);
  writeResume(storage, {
    userId,
    householdId,
    babies: current?.householdId === householdId ? current.babies : [],
    tab: current?.tab ?? "today",
    latest: current?.householdId === householdId ? current.latest : {},
  });
}

export function rememberBabies(storage: StorageLike, userId: string, householdId: string, babies: Baby[]): void {
  const current = readResume(storage, userId);
  writeResume(storage, {
    userId,
    householdId,
    babies,
    tab: current?.tab ?? "today",
    latest: current?.latest ?? {},
  });
}

export function rememberTab(storage: StorageLike, userId: string, tab: ResumeTab): void {
  const current = readResume(storage, userId);
  if (!current) return;
  writeResume(storage, { ...current, tab });
}

export function rememberLatest(storage: StorageLike, userId: string, babyId: string, latest: CachedLatest): void {
  const current = readResume(storage, userId);
  if (!current) return;
  writeResume(storage, {
    ...current,
    latest: { ...current.latest, [babyId]: latest },
  });
}

function writeResume(storage: StorageLike, resume: Resume): void {
  storage.setItem(resumeKey, JSON.stringify(resume));
}

function readStoredUserId(storage: Pick<Storage, "getItem">, key: string): string | null {
  return userIdFrom(storage.getItem(key)) ?? userIdFrom(storage.getItem(`${key}-user`));
}

function userIdFrom(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { user?: { id?: unknown } };
    return typeof parsed.user?.id === "string" && parsed.user.id !== "" ? parsed.user.id : null;
  } catch {
    return null;
  }
}

function openingFromLocal(storage: Pick<Storage, "getItem">): Opening {
  const raw = storage.getItem(localDbKey);
  if (!raw) return emptyOpening;
  try {
    const parsed = JSON.parse(raw) as {
      sessionUserId?: unknown;
      members?: Array<{ user_id?: unknown; household_id?: unknown }>;
      babies?: unknown[];
    };
    const userId = typeof parsed.sessionUserId === "string" && parsed.sessionUserId !== "" ? parsed.sessionUserId : null;
    if (!userId) return emptyOpening;
    const member = (parsed.members ?? []).find(
      (item) => item.user_id === userId && typeof item.household_id === "string" && item.household_id !== "",
    );
    const householdId = typeof member?.household_id === "string" ? member.household_id : null;
    const babies = (parsed.babies ?? []).filter(isBaby).filter((baby) => baby.household_id === householdId);
    const resume = readResume(storage, userId);
    return {
      userId,
      householdId,
      babies,
      tab: resume?.tab ?? "today",
      latest: resume?.latest ?? {},
    };
  } catch {
    return emptyOpening;
  }
}

function isBaby(value: unknown): value is Baby {
  if (!value || typeof value !== "object") return false;
  const baby = value as Record<string, unknown>;
  return (
    typeof baby.id === "string" &&
    typeof baby.household_id === "string" &&
    typeof baby.name === "string" &&
    (baby.born_on === null || typeof baby.born_on === "string")
  );
}

function sanitizeLatest(value: unknown): Record<string, CachedLatest> {
  if (!value || typeof value !== "object") return {};
  const latest: Record<string, CachedLatest> = {};
  for (const [babyId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { feed?: unknown; diaper?: unknown };
    latest[babyId] = {
      feed: isCachedFeed(record.feed) ? record.feed : null,
      diaper: isCachedDiaper(record.diaper) ? record.diaper : null,
    };
  }
  return latest;
}

function isCachedFeed(value: unknown): value is CachedFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Record<string, unknown>;
  return (
    typeof feed.id === "string" &&
    typeof feed.started_at === "string" &&
    (feed.ended_at === null || typeof feed.ended_at === "string") &&
    typeof feed.paused_ms === "number" &&
    (feed.paused_at === null || typeof feed.paused_at === "string") &&
    (feed.side === null || feed.side === "left" || feed.side === "right" || feed.side === "both") &&
    (feed.kind === "breast" || feed.kind === "bottle") &&
    (feed.ml === null || typeof feed.ml === "number")
  );
}

function isCachedDiaper(value: unknown): value is CachedDiaper {
  if (!value || typeof value !== "object") return false;
  const diaper = value as Record<string, unknown>;
  return (
    typeof diaper.id === "string" &&
    typeof diaper.occurred_at === "string" &&
    (diaper.kind === "pee" || diaper.kind === "poop" || diaper.kind === "both")
  );
}
