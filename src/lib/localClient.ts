import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaperKind, FeedSide } from "../domain";
import { computeRangeStats } from "./computeRangeStats";
import { normalizeEmail } from "./email";

const storageKey = "nido-lactancia.local-db";

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
};

type HouseholdRow = {
  id: string;
  owner_id: string;
  created_at: string;
};

type MemberRow = {
  household_id: string;
  user_id: string;
  created_at: string;
};

type InviteRow = {
  id: string;
  household_id: string;
  code: string;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
};

type EmailInviteRow = {
  household_id: string;
  email: string;
  invited_by: string;
  created_at: string;
};

type BabyRow = {
  id: string;
  household_id: string;
  name: string;
  born_on: string | null;
  pediatrician_name: string | null;
  pediatrician_phone: string | null;
  blood_type: string | null;
  allergies: string | null;
  health_insurance: string | null;
  health_insurance_card: string | null;
  created_at: string;
};

type WeightRow = {
  id: string;
  household_id: string;
  baby_id: string;
  weighed_on: string;
  grams: number | null;
  length_mm: number | null;
  created_at: string;
};

type FeedRow = {
  id: string;
  household_id: string;
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  paused_ms: number;
  paused_at: string | null;
  side: FeedSide | null;
  kind: "breast" | "bottle";
  ml: number | null;
  session_id: string | null;
  created_by: string;
  created_at: string;
};

type DiaperRow = {
  id: string;
  household_id: string;
  baby_id: string;
  occurred_at: string;
  kind: DiaperKind;
  created_by: string;
  created_at: string;
};

type FeedPairDismissalRow = {
  id: string;
  earlier_feed_id: string;
  later_feed_id: string;
  household_id: string;
  created_at: string;
};

type VaccineCatalogRow = {
  id: string;
  code: string;
  name: string;
  life_stage: string;
  due_label: string;
  sort_order: number;
  active: boolean;
};

type BabyVaccinationRow = {
  id: string;
  baby_id: string;
  catalog_id: string | null;
  display_name: string | null;
  custom_name: string | null;
  status: "pending" | "done";
  given_on: string | null;
  lot_number: string | null;
  updated_by: string;
  updated_at: string;
};

type PediatricVisitRow = {
  id: string;
  baby_id: string;
  visited_on: string;
  reason: string;
  notes: string | null;
  grams: number | null;
  length_mm: number | null;
  updated_by: string;
  updated_at: string;
};

type Database = {
  users: UserRow[];
  households: HouseholdRow[];
  members: MemberRow[];
  invites: InviteRow[];
  emailInvites: EmailInviteRow[];
  babies: BabyRow[];
  feeds: FeedRow[];
  diapers: DiaperRow[];
  weights: WeightRow[];
  feedPairDismissals: FeedPairDismissalRow[];
  vaccineCatalog: VaccineCatalogRow[];
  babyVaccinations: BabyVaccinationRow[];
  pediatricVisits: PediatricVisitRow[];
  sessionUserId: string | null;
};

type Row = Record<string, unknown>;
type ErrorResult = { code?: string; message: string } | null;
type Listener = (session: { user: { id: string } } | null) => void;

export function createLocalClient(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): SupabaseClient {
  const listeners = new Set<Listener>();

  function load(): Database {
    const raw = storage.getItem(storageKey);
    if (!raw) return emptyDatabase();
    const parsed = JSON.parse(raw) as Partial<Database>;
    const db: Database = {
      users: parsed.users ?? [],
      households: parsed.households ?? [],
      members: parsed.members ?? [],
      invites: parsed.invites ?? [],
      emailInvites: parsed.emailInvites ?? [],
      babies: (parsed.babies ?? []).map((baby) => ({
        ...baby,
        born_on: baby.born_on ?? null,
        pediatrician_name: baby.pediatrician_name ?? null,
        pediatrician_phone: baby.pediatrician_phone ?? null,
        blood_type: baby.blood_type ?? null,
        allergies: baby.allergies ?? null,
        health_insurance: baby.health_insurance ?? null,
        health_insurance_card: baby.health_insurance_card ?? null,
      })),
      feeds: (parsed.feeds ?? []).map((feed) => ({
        ...feed,
        kind: feed.kind ?? "breast",
        ml: feed.ml ?? null,
        paused_ms: feed.paused_ms ?? 0,
        paused_at: feed.paused_at ?? null,
        session_id: feed.session_id ?? null,
      })),
      diapers: parsed.diapers ?? [],
      weights: parsed.weights ?? [],
      feedPairDismissals: parsed.feedPairDismissals ?? [],
      vaccineCatalog: parsed.vaccineCatalog?.length ? parsed.vaccineCatalog : seedVaccineCatalog(),
      babyVaccinations: parsed.babyVaccinations ?? [],
      pediatricVisits: parsed.pediatricVisits ?? [],
      sessionUserId: parsed.sessionUserId ?? null,
    };
    backfillHouseholdsFromMembers(db);
    return db;
  }

  function save(db: Database) {
    storage.setItem(storageKey, JSON.stringify(db));
  }

  function sessionOf(db: Database) {
    return db.sessionUserId ? { user: { id: db.sessionUserId } } : null;
  }

  function notify() {
    const session = sessionOf(load());
    for (const listener of listeners) listener(session);
  }

  function requireUser(db: Database): string {
    if (!db.sessionUserId) throw new Error("not authenticated");
    return db.sessionUserId;
  }

  const client = {
    auth: {
      async getSession() {
        return { data: { session: sessionOf(load()) } };
      },
      onAuthStateChange(callback: Listener) {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      async signUp({ email, password }: { email: string; password: string }) {
        const db = load();
        const normalized = email.trim().toLowerCase();
        if (db.users.some((user) => user.email === normalized)) {
          return { data: { session: null }, error: { message: "User already registered" } };
        }
        const user = { id: crypto.randomUUID(), email: normalized, passwordHash: await hashPassword(password) };
        db.users.push(user);
        acceptNewestEmailInvite(db, user.id, normalized);
        db.sessionUserId = user.id;
        save(db);
        notify();
        return { data: { session: sessionOf(db) }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const db = load();
        const normalized = email.trim().toLowerCase();
        const user = db.users.find((item) => item.email.toLowerCase() === normalized);
        if (!user || user.passwordHash !== (await hashPassword(password))) {
          return { data: { session: null }, error: { message: "Invalid login credentials" } };
        }
        db.sessionUserId = user.id;
        save(db);
        notify();
        return { data: { session: sessionOf(db) }, error: null };
      },
      async signOut() {
        const db = load();
        db.sessionUserId = null;
        save(db);
        notify();
        return { error: null };
      },
    },
    from(table: string) {
      return new Query(table, load, save, requireUser);
    },
    async rpc(name: string, args: Record<string, string> = {}) {
      try {
        const db = load();
        const userId = requireUser(db);
        if (name === "bootstrap_household") {
          const existing = db.members.find((member) => member.user_id === userId);
          if (existing) return { data: existing.household_id, error: null };
          const householdId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.households.push({ id: householdId, owner_id: userId, created_at: now });
          db.members.push({ household_id: householdId, user_id: userId, created_at: now });
          db.invites.push({
            id: crypto.randomUUID(),
            household_id: householdId,
            code: randomCode(),
            expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            redeemed_by: null,
            redeemed_at: null,
            created_at: now,
          });
          save(db);
          return { data: householdId, error: null };
        }
        if (name === "join_household") {
          if (db.members.some((member) => member.user_id === userId)) {
            return { data: null, error: { message: "already in a household" } };
          }
          const invite = db.invites.find(
            (item) => item.code === args.p_code?.trim() && item.redeemed_at === null && item.expires_at > new Date().toISOString(),
          );
          if (!invite) return { data: null, error: { message: "invalid invite" } };
          invite.redeemed_at = new Date().toISOString();
          invite.redeemed_by = userId;
          db.members.push({ household_id: invite.household_id, user_id: userId, created_at: invite.redeemed_at });
          save(db);
          return { data: invite.household_id, error: null };
        }
        if (name === "invite_by_email") {
          const email = normalizeEmail(args.p_email ?? "");
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const household = db.households.find((item) => item.id === member.household_id);
          if (!household || household.owner_id !== userId) {
            return { data: null, error: { message: "not household owner" } };
          }
          const target = db.users.find((user) => user.email === email);
          if (target) {
            const targetMember = db.members.find((item) => item.user_id === target.id);
            if (targetMember?.household_id === member.household_id) {
              return { data: null, error: null };
            }
            if (targetMember) return { data: null, error: { message: "already in a household" } };
            db.members.push({
              household_id: member.household_id,
              user_id: target.id,
              created_at: new Date().toISOString(),
            });
            db.emailInvites = db.emailInvites.filter(
              (invite) => !(invite.household_id === member.household_id && invite.email === email),
            );
            save(db);
            return { data: null, error: null };
          }
          const now = new Date().toISOString();
          const existing = db.emailInvites.find(
            (invite) => invite.household_id === member.household_id && invite.email === email,
          );
          if (existing) {
            existing.invited_by = userId;
            existing.created_at = now;
          } else {
            db.emailInvites.push({
              household_id: member.household_id,
              email,
              invited_by: userId,
              created_at: now,
            });
          }
          save(db);
          return { data: null, error: null };
        }
        if (name === "accept_email_invite") {
          const user = db.users.find((item) => item.id === userId);
          if (!user) return { data: null, error: { message: "not authenticated" } };
          const householdId = acceptNewestEmailInvite(db, userId, user.email);
          save(db);
          return { data: householdId, error: null };
        }
        if (name === "touch_last_seen") {
          return { data: null, error: null };
        }
        if (name === "create_invite") {
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const code = randomCode();
          db.invites.push({
            id: crypto.randomUUID(),
            household_id: member.household_id,
            code,
            expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            redeemed_by: null,
            redeemed_at: null,
            created_at: new Date().toISOString(),
          });
          save(db);
          return { data: code, error: null };
        }
        if (name === "list_household_people") {
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const household = db.households.find((item) => item.id === member.household_id);
          const members = db.members
            .filter((item) => item.household_id === member.household_id)
            .map((item) => {
              const user = db.users.find((u) => u.id === item.user_id);
              return {
                user_id: item.user_id,
                email: user?.email ?? "",
                is_owner: item.user_id === household?.owner_id,
                is_self: item.user_id === userId,
              };
            });
          const pending = db.emailInvites
            .filter((item) => item.household_id === member.household_id)
            .map((item) => ({ email: item.email, created_at: item.created_at }));
          return { data: { members, pending }, error: null };
        }
        if (name === "remove_household_member") {
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const household = db.households.find((item) => item.id === member.household_id);
          if (!household || household.owner_id !== userId) {
            return { data: null, error: { message: "not household owner" } };
          }
          const targetId = args.p_user_id;
          if (targetId === userId) return { data: null, error: { message: "cannot remove self" } };
          if (targetId === household.owner_id) return { data: null, error: { message: "cannot remove owner" } };
          const index = db.members.findIndex(
            (item) => item.household_id === member.household_id && item.user_id === targetId,
          );
          if (index === -1) return { data: null, error: { message: "member not found" } };
          db.members.splice(index, 1);
          save(db);
          return { data: null, error: null };
        }
        if (name === "cancel_email_invite") {
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const household = db.households.find((item) => item.id === member.household_id);
          if (!household || household.owner_id !== userId) {
            return { data: null, error: { message: "not household owner" } };
          }
          const email = normalizeEmail(args.p_email ?? "");
          const before = db.emailInvites.length;
          db.emailInvites = db.emailInvites.filter(
            (item) => !(item.household_id === member.household_id && item.email === email),
          );
          if (db.emailInvites.length === before) {
            return { data: null, error: { message: "invite not found" } };
          }
          save(db);
          return { data: null, error: null };
        }
        if (name === "leave_household") {
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const household = db.households.find((item) => item.id === member.household_id);
          if (household?.owner_id === userId) {
            return { data: null, error: { message: "owner cannot leave" } };
          }
          db.members = db.members.filter((item) => !(item.household_id === member.household_id && item.user_id === userId));
          save(db);
          return { data: null, error: null };
        }
        if (name === "transfer_household_ownership") {
          const member = db.members.find((item) => item.user_id === userId);
          if (!member) return { data: null, error: { message: "not in a household" } };
          const household = db.households.find((item) => item.id === member.household_id);
          if (!household || household.owner_id !== userId) {
            return { data: null, error: { message: "not household owner" } };
          }
          const targetId = args.p_user_id;
          if (targetId === userId) {
            return { data: null, error: { message: "cannot transfer to self" } };
          }
          const targetMember = db.members.find(
            (item) => item.household_id === member.household_id && item.user_id === targetId,
          );
          if (!targetMember) return { data: null, error: { message: "member not found" } };
          household.owner_id = targetId;
          save(db);
          return { data: null, error: null };
        }
        if (name === "range_stats") {
          const baby = db.babies.find((item) => item.id === args.p_baby_id);
          const member = db.members.find((item) => item.user_id === userId);
          if (!baby || !member || baby.household_id !== member.household_id) {
            return { data: null, error: { message: "not allowed" } };
          }
          return {
            data: computeRangeStats(db.feeds, db.diapers, baby.id, args.p_from, args.p_to, args.p_tz),
            error: null,
          };
        }
        return { data: null, error: { message: "unknown rpc" } };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "error" } };
      }
    },
    channel() {
      return {
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
      };
    },
    removeChannel() {
      return Promise.resolve("ok");
    },
  };

  return client as unknown as SupabaseClient;
}

class Query {
  private operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private filters: { op: "eq" | "is" | "gte" | "lt" | "gt"; column: string; value: unknown }[] = [];
  private ordering: { column: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private shape: "many" | "maybe" | "one" = "many";
  private columns = "*";
  private payload: Row | null = null;
  private onConflict: string | null = null;

  constructor(
    private readonly table: string,
    private readonly load: () => Database,
    private readonly save: (db: Database) => void,
    private readonly requireUser: (db: Database) => string,
  ) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }

  insert(payload: Row) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row, options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.payload = payload;
    this.onConflict = options?.onConflict ?? null;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: "lt", column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ op: "gt", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.ordering = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  maybeSingle() {
    this.shape = "maybe";
    return this;
  }

  single() {
    this.shape = "one";
    return this;
  }

  then(
    resolve: (value: { data: unknown; error: ErrorResult }) => void,
    reject?: (reason: unknown) => void,
  ) {
    return this.execute().then(resolve, reject);
  }

  private async execute(): Promise<{ data: unknown; error: ErrorResult }> {
    const db = this.load();
    try {
      this.requireUser(db);
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "error" } };
    }
    const rows = rowsOf(db, this.table);
    if (this.operation === "insert" || this.operation === "upsert") {
      const conflictColumns = (this.onConflict ?? "")
        .split(",")
        .map((column) => column.trim())
        .filter((column) => column !== "");
      const existing =
        this.operation === "upsert" && conflictColumns.length > 0
          ? rows.find((row) => conflictColumns.every((column) => row[column] === this.payload?.[column]))
          : undefined;
      if (existing) {
        const next = { ...existing, ...this.payload };
        const constraint = constraintError(db, this.table, next, String(existing.id));
        if (constraint) return { data: null, error: constraint };
        Object.assign(existing, this.payload);
        this.save(db);
        return { data: this.shape === "many" ? null : project(existing, this.columns), error: null };
      }
      const row: Row = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: db.sessionUserId,
        ...this.payload,
      };
      if (this.table === "feeds" && row.kind === undefined) row.kind = "breast";
      if (this.table === "feeds" && row.ml === undefined) row.ml = null;
      if (this.table === "feeds" && row.ended_at === undefined) row.ended_at = null;
      if (this.table === "feeds" && row.paused_ms === undefined) row.paused_ms = 0;
      if (this.table === "feeds" && row.paused_at === undefined) row.paused_at = null;
      if (this.table === "feeds" && row.session_id === undefined) row.session_id = null;
      if (this.table === "babies" && row.born_on === undefined) row.born_on = null;
      if (this.table === "babies" && row.pediatrician_name === undefined) row.pediatrician_name = null;
      if (this.table === "babies" && row.pediatrician_phone === undefined) row.pediatrician_phone = null;
      if (this.table === "babies" && row.blood_type === undefined) row.blood_type = null;
      if (this.table === "babies" && row.allergies === undefined) row.allergies = null;
      if (this.table === "babies" && row.health_insurance === undefined) row.health_insurance = null;
      if (this.table === "babies" && row.health_insurance_card === undefined) row.health_insurance_card = null;
      if (this.table === "weights" && row.grams === undefined) row.grams = null;
      if (this.table === "weights" && row.length_mm === undefined) row.length_mm = null;
      if (this.table === "baby_vaccinations") {
        row.catalog_id = row.catalog_id ?? null;
        row.display_name = row.display_name ?? null;
        row.custom_name = row.custom_name ?? null;
        row.given_on = row.given_on ?? null;
        row.lot_number = row.lot_number ?? null;
        row.updated_by = db.sessionUserId;
        row.updated_at = new Date().toISOString();
      }
      if (this.table === "pediatric_visits") {
        row.notes = row.notes ?? null;
        row.grams = row.grams ?? null;
        row.length_mm = row.length_mm ?? null;
        row.updated_by = db.sessionUserId;
        row.updated_at = new Date().toISOString();
      }
      const constraint = constraintError(db, this.table, row, null);
      if (constraint) return { data: null, error: constraint };
      rows.push(row);
      this.save(db);
      return { data: this.shape === "many" ? null : project(row, this.columns), error: null };
    }
    let matched = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    if (this.table === "household_members" && this.operation === "select" && db.sessionUserId) {
      matched = matched.filter((row) => row.user_id === db.sessionUserId);
    }
    if (this.operation === "update") {
      for (const row of matched) {
        const patch = { ...this.payload };
        if (this.table === "baby_vaccinations" || this.table === "pediatric_visits") {
          patch.updated_by = db.sessionUserId;
          patch.updated_at = new Date().toISOString();
        }
        const next = { ...row, ...patch };
        const constraint = constraintError(db, this.table, next, String(row.id));
        if (constraint) return { data: null, error: constraint };
        Object.assign(row, patch);
      }
      this.save(db);
      return { data: null, error: null };
    }
    if (this.operation === "delete") {
      const ids = new Set(matched.map((row) => row.id));
      if (this.table === "babies") {
        const removedFeeds = new Set(db.feeds.filter((feed) => ids.has(feed.baby_id)).map((feed) => feed.id));
        db.feedPairDismissals = db.feedPairDismissals.filter(
          (pair) => !removedFeeds.has(pair.earlier_feed_id) && !removedFeeds.has(pair.later_feed_id),
        );
        db.feeds = db.feeds.filter((feed) => !ids.has(feed.baby_id));
        db.diapers = db.diapers.filter((diaper) => !ids.has(diaper.baby_id));
        db.weights = db.weights.filter((weight) => !ids.has(weight.baby_id));
        db.babyVaccinations = db.babyVaccinations.filter((vaccination) => !ids.has(vaccination.baby_id));
        db.pediatricVisits = db.pediatricVisits.filter((visit) => !ids.has(visit.baby_id));
      }
      if (this.table === "feeds") {
        db.feedPairDismissals = db.feedPairDismissals.filter(
          (pair) => !ids.has(pair.earlier_feed_id) && !ids.has(pair.later_feed_id),
        );
      }
      replaceRows(db, this.table, rows.filter((row) => !ids.has(row.id)));
      this.save(db);
      return { data: null, error: null };
    }
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      matched = [...matched].sort((left, right) => {
        const compared = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
        return ascending ? compared : -compared;
      });
    }
    if (this.maxRows !== null) matched = matched.slice(0, this.maxRows);
    const projected = matched.map((row) => project(row, this.columns));
    if (this.shape === "many") return { data: projected, error: null };
    if (projected.length === 0) return { data: null, error: this.shape === "one" ? { message: "not found" } : null };
    if (projected.length > 1) return { data: null, error: { message: "multiple rows" } };
    return { data: projected[0], error: null };
  }
}

function acceptNewestEmailInvite(db: Database, userId: string, email: string): string | null {
  const existing = db.members.find((member) => member.user_id === userId);
  if (existing) return existing.household_id;
  const pending = db.emailInvites
    .filter((invite) => invite.email === email)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const newest = pending[0];
  if (!newest) return null;
  db.members.push({
    household_id: newest.household_id,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  db.emailInvites = db.emailInvites.filter(
    (invite) => !(invite.household_id === newest.household_id && invite.email === newest.email),
  );
  return newest.household_id;
}

function backfillHouseholdsFromMembers(db: Database) {
  for (const member of db.members) {
    if (db.households.some((household) => household.id === member.household_id)) continue;
    const inHousehold = db.members
      .filter((item) => item.household_id === member.household_id)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.user_id.localeCompare(right.user_id));
    const owner = inHousehold[0];
    if (!owner) continue;
    db.households.push({
      id: member.household_id,
      owner_id: owner.user_id,
      created_at: owner.created_at,
    });
  }
}

function emptyDatabase(): Database {
  return {
    users: [],
    households: [],
    members: [],
    invites: [],
    emailInvites: [],
    babies: [],
    feeds: [],
    diapers: [],
    weights: [],
    feedPairDismissals: [],
    vaccineCatalog: seedVaccineCatalog(),
    babyVaccinations: [],
    pediatricVisits: [],
    sessionUserId: null,
  };
}

/** Same codes / labels as supabase/migrations/0015_baby_vaccines.sql */
function seedVaccineCatalog(): VaccineCatalogRow[] {
  const seed: Omit<VaccineCatalogRow, "id" | "active">[] = [
    { code: "hepb_birth", name: "Hepatitis B", life_stage: "newborn", due_label: "Al nacer", sort_order: 10 },
    { code: "bcg_birth", name: "BCG", life_stage: "newborn", due_label: "Al nacer", sort_order: 20 },
    { code: "pneumo_2m", name: "Neumococo", life_stage: "up_to_1y", due_label: "2 meses", sort_order: 110 },
    { code: "polio_2m", name: "Polio", life_stage: "up_to_1y", due_label: "2 meses", sort_order: 120 },
    { code: "quintuple_2m", name: "Quíntuple", life_stage: "up_to_1y", due_label: "2 meses", sort_order: 130 },
    { code: "rota_2m", name: "Rotavirus", life_stage: "up_to_1y", due_label: "2 meses", sort_order: 140 },
    { code: "meningo_3m", name: "Meningococo", life_stage: "up_to_1y", due_label: "3 meses", sort_order: 150 },
    { code: "pneumo_4m", name: "Neumococo", life_stage: "up_to_1y", due_label: "4 meses", sort_order: 160 },
    { code: "polio_4m", name: "Polio", life_stage: "up_to_1y", due_label: "4 meses", sort_order: 170 },
    { code: "quintuple_4m", name: "Quíntuple", life_stage: "up_to_1y", due_label: "4 meses", sort_order: 180 },
    { code: "rota_4m", name: "Rotavirus", life_stage: "up_to_1y", due_label: "4 meses", sort_order: 190 },
    { code: "meningo_5m", name: "Meningococo", life_stage: "up_to_1y", due_label: "5 meses", sort_order: 200 },
    { code: "polio_6m", name: "Polio", life_stage: "up_to_1y", due_label: "6 meses", sort_order: 210 },
    { code: "quintuple_6m", name: "Quíntuple", life_stage: "up_to_1y", due_label: "6 meses", sort_order: 220 },
    { code: "flu_6_24_1", name: "Antigripal", life_stage: "up_to_1y", due_label: "6 a 24 meses · 1ª", sort_order: 230 },
    { code: "flu_6_24_2", name: "Antigripal", life_stage: "up_to_1y", due_label: "6 a 24 meses · 2ª", sort_order: 240 },
    { code: "pneumo_12m", name: "Neumococo", life_stage: "up_to_1y", due_label: "12 meses", sort_order: 250 },
    { code: "hepa_12m", name: "Hepatitis A", life_stage: "up_to_1y", due_label: "12 meses", sort_order: 260 },
    { code: "mmr_12m", name: "Triple viral", life_stage: "up_to_1y", due_label: "12 meses", sort_order: 270 },
    { code: "meningo_15m", name: "Meningococo", life_stage: "up_to_2y", due_label: "15 meses", sort_order: 310 },
    { code: "varicella_15m", name: "Varicela", life_stage: "up_to_2y", due_label: "15 meses", sort_order: 320 },
    { code: "quintuple_15_18m", name: "Quíntuple", life_stage: "up_to_2y", due_label: "15 a 18 meses", sort_order: 330 },
    { code: "mmr_5y", name: "Triple viral", life_stage: "age_5", due_label: "5 años", sort_order: 410 },
    { code: "polio_5y", name: "Polio", life_stage: "age_5", due_label: "5 años", sort_order: 420 },
    { code: "triple_bac_5y", name: "Triple bacteriana", life_stage: "age_5", due_label: "5 años", sort_order: 430 },
  ];
  return seed.map((item) => ({
    ...item,
    id: stableCatalogId(item.code),
    active: true,
  }));
}

function stableCatalogId(code: string): string {
  const hex = [...new TextEncoder().encode(code)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .padEnd(32, "0")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function rowsOf(db: Database, table: string): Row[] {
  if (table === "household_members") return db.members as unknown as Row[];
  if (table === "invites") return db.invites as unknown as Row[];
  if (table === "email_invites") return db.emailInvites as unknown as Row[];
  if (table === "babies") return db.babies as unknown as Row[];
  if (table === "feeds") return db.feeds as unknown as Row[];
  if (table === "diapers") return db.diapers as unknown as Row[];
  if (table === "weights") return db.weights as unknown as Row[];
  if (table === "feed_pair_dismissals") return db.feedPairDismissals as unknown as Row[];
  if (table === "vaccine_catalog") return db.vaccineCatalog as unknown as Row[];
  if (table === "baby_vaccinations") return db.babyVaccinations as unknown as Row[];
  if (table === "pediatric_visits") return db.pediatricVisits as unknown as Row[];
  return [];
}

function replaceRows(db: Database, table: string, rows: Row[]) {
  if (table === "babies") db.babies = rows as unknown as BabyRow[];
  if (table === "feeds") db.feeds = rows as unknown as FeedRow[];
  if (table === "diapers") db.diapers = rows as unknown as DiaperRow[];
  if (table === "weights") db.weights = rows as unknown as WeightRow[];
  if (table === "feed_pair_dismissals") db.feedPairDismissals = rows as unknown as FeedPairDismissalRow[];
  if (table === "vaccine_catalog") db.vaccineCatalog = rows as unknown as VaccineCatalogRow[];
  if (table === "baby_vaccinations") db.babyVaccinations = rows as unknown as BabyVaccinationRow[];
  if (table === "pediatric_visits") db.pediatricVisits = rows as unknown as PediatricVisitRow[];
  if (table === "invites") db.invites = rows as unknown as InviteRow[];
  if (table === "email_invites") db.emailInvites = rows as unknown as EmailInviteRow[];
  if (table === "household_members") db.members = rows as unknown as MemberRow[];
}

function matches(row: Row, filter: { op: string; column: string; value: unknown }): boolean {
  const value = row[filter.column];
  if (filter.op === "eq" || filter.op === "is") return value === filter.value;
  if (value == null || filter.value == null) return false;
  if (filter.op === "gte") return String(value) >= String(filter.value);
  if (filter.op === "lt") return String(value) < String(filter.value);
  return String(value) > String(filter.value);
}

function project(row: Row, columns: string): Row {
  if (columns === "*") return { ...row };
  const picked: Row = {};
  for (const column of columns.split(",").map((item) => item.trim())) picked[column] = row[column];
  return picked;
}

function constraintError(db: Database, table: string, row: Row, ignoreId: string | null): ErrorResult {
  if (table === "baby_vaccinations") {
    if (row.status !== "pending" && row.status !== "done") {
      return { code: "23514", message: "baby_vaccinations_status_check" };
    }
    if (row.given_on != null) {
      const todayUtc = new Date().toISOString().slice(0, 10);
      if (String(row.given_on) > todayUtc) {
        return { code: "23514", message: "baby_vaccinations_given_on_not_future" };
      }
    }
    const catalogId = row.catalog_id ?? null;
    const customName = row.custom_name == null ? null : String(row.custom_name).trim() || null;
    const displayName = row.display_name == null ? null : String(row.display_name).trim() || null;
    const catalogOk = catalogId != null && customName == null;
    const customOk = catalogId == null && displayName == null && customName != null;
    if (!catalogOk && !customOk) {
      return { code: "23514", message: "baby_vaccinations_catalog_xor_custom" };
    }
    if (catalogId != null) {
      const duplicate = db.babyVaccinations.find(
        (item) => item.baby_id === row.baby_id && item.catalog_id === catalogId && item.id !== ignoreId,
      );
      if (duplicate) return { code: "23505", message: "baby_vaccinations_baby_id_catalog_id_key" };
    }
    return null;
  }
  if (table === "pediatric_visits") {
    const grams = row.grams ?? null;
    const lengthMm = row.length_mm ?? null;
    if (grams !== null && (typeof grams !== "number" || !Number.isInteger(grams) || grams <= 0 || grams >= 30_000)) {
      return { code: "23514", message: "pediatric_visits_grams_check" };
    }
    if (
      lengthMm !== null &&
      (typeof lengthMm !== "number" || !Number.isInteger(lengthMm) || lengthMm < 200 || lengthMm > 1200)
    ) {
      return { code: "23514", message: "pediatric_visits_length_mm_check" };
    }
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (String(row.visited_on) > todayUtc) {
      return { code: "23514", message: "pediatric_visits_visited_on_not_future" };
    }
    return null;
  }
  if (table === "weights") {
    const grams = row.grams ?? null;
    const lengthMm = row.length_mm ?? null;
    if (grams !== null && (typeof grams !== "number" || !Number.isInteger(grams) || grams <= 0 || grams >= 30_000)) {
      return { code: "23514", message: "weights_grams_check" };
    }
    if (
      lengthMm !== null &&
      (typeof lengthMm !== "number" || !Number.isInteger(lengthMm) || lengthMm < 200 || lengthMm > 1200)
    ) {
      return { code: "23514", message: "weights_length_mm_check" };
    }
    if (grams === null && lengthMm === null) {
      return { code: "23514", message: "weights_measure_present" };
    }
    const duplicate = db.weights.find(
      (weight) => weight.baby_id === row.baby_id && weight.weighed_on === row.weighed_on && weight.id !== ignoreId,
    );
    if (duplicate) return { code: "23505", message: "weights_baby_day" };
    return null;
  }
  if (table === "feed_pair_dismissals") {
    const duplicate = db.feedPairDismissals.find(
      (pair) => pair.earlier_feed_id === row.earlier_feed_id && pair.later_feed_id === row.later_feed_id && pair.id !== ignoreId,
    );
    if (duplicate || row.earlier_feed_id === row.later_feed_id) return { code: "23505", message: "feed_pair_dismissals_pkey" };
    return null;
  }
  if (table !== "feeds") return null;
  if (row.kind === "bottle") {
    const ml = row.ml;
    const sameInstant = row.ended_at != null && new Date(String(row.ended_at)).getTime() === new Date(String(row.started_at)).getTime();
    if (
      row.side != null ||
      row.session_id != null ||
      typeof ml !== "number" ||
      !Number.isInteger(ml) ||
      ml < 1 ||
      !sameInstant ||
      row.paused_at != null ||
      row.paused_ms !== 0
    ) {
      return { code: "23514", message: "feeds_shape" };
    }
    return null;
  }
  if (row.side == null || row.ml != null) return { code: "23514", message: "feeds_shape" };
  if (row.session_id != null) {
    const otherBaby = db.feeds.find(
      (feed) => feed.session_id === row.session_id && feed.baby_id !== row.baby_id && feed.id !== ignoreId,
    );
    if (otherBaby) return { code: "23514", message: "feeds_session_same_baby" };
  }
  if (row.ended_at != null && String(row.ended_at) <= String(row.started_at)) {
    return { code: "23514", message: "feeds_ended_after_start" };
  }
  if (typeof row.paused_ms === "number" && row.paused_ms < 0) {
    return { code: "23514", message: "feeds_paused_ms_non_negative" };
  }
  if (row.ended_at == null) {
    const open = db.feeds.find((feed) => feed.baby_id === row.baby_id && feed.ended_at === null && feed.id !== ignoreId);
    if (open) return { code: "23505", message: "duplicate key" };
  }
  return null;
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
