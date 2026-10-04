import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaperKind, FeedSide } from "../domain";
import { computeRangeStats } from "./computeRangeStats";

const storageKey = "nido-lactancia.local-db";

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
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

type BabyRow = {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
};

type FeedRow = {
  id: string;
  household_id: string;
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  side: FeedSide;
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

type Database = {
  users: UserRow[];
  members: MemberRow[];
  invites: InviteRow[];
  babies: BabyRow[];
  feeds: FeedRow[];
  diapers: DiaperRow[];
  sessionUserId: string | null;
};

type Row = Record<string, unknown>;
type ErrorResult = { code?: string; message: string } | null;
type Listener = (session: { user: { id: string } } | null) => void;

export function createLocalClient(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): SupabaseClient {
  const listeners = new Set<Listener>();

  function load(): Database {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return { users: [], members: [], invites: [], babies: [], feeds: [], diapers: [], sessionUserId: null };
    }
    return JSON.parse(raw) as Database;
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
        if (db.users.some((user) => user.email === email)) {
          return { data: { session: null }, error: { message: "User already registered" } };
        }
        const user = { id: crypto.randomUUID(), email, passwordHash: await hashPassword(password) };
        db.users.push(user);
        db.sessionUserId = user.id;
        save(db);
        notify();
        return { data: { session: sessionOf(db) }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const db = load();
        const user = db.users.find((item) => item.email === email);
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
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private filters: { op: "eq" | "is" | "gte" | "lt" | "gt"; column: string; value: unknown }[] = [];
  private ordering: { column: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private shape: "many" | "maybe" | "one" = "many";
  private columns = "*";
  private payload: Row | null = null;

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
    if (this.operation === "insert") {
      const row: Row = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: db.sessionUserId,
        ...this.payload,
      };
      if (this.table === "feeds" && row.ended_at === undefined) row.ended_at = null;
      const constraint = constraintError(db, this.table, row, null);
      if (constraint) return { data: null, error: constraint };
      rows.push(row);
      this.save(db);
      return { data: this.shape === "many" ? null : project(row, this.columns), error: null };
    }
    let matched = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    if (this.operation === "update") {
      for (const row of matched) {
        const next = { ...row, ...this.payload };
        const constraint = constraintError(db, this.table, next, String(row.id));
        if (constraint) return { data: null, error: constraint };
        Object.assign(row, this.payload);
      }
      this.save(db);
      return { data: null, error: null };
    }
    if (this.operation === "delete") {
      const ids = new Set(matched.map((row) => row.id));
      if (this.table === "babies") {
        db.feeds = db.feeds.filter((feed) => !ids.has(feed.baby_id));
        db.diapers = db.diapers.filter((diaper) => !ids.has(diaper.baby_id));
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

function rowsOf(db: Database, table: string): Row[] {
  if (table === "household_members") return db.members as unknown as Row[];
  if (table === "invites") return db.invites as unknown as Row[];
  if (table === "babies") return db.babies as unknown as Row[];
  if (table === "feeds") return db.feeds as unknown as Row[];
  if (table === "diapers") return db.diapers as unknown as Row[];
  return [];
}

function replaceRows(db: Database, table: string, rows: Row[]) {
  if (table === "babies") db.babies = rows as unknown as BabyRow[];
  if (table === "feeds") db.feeds = rows as unknown as FeedRow[];
  if (table === "diapers") db.diapers = rows as unknown as DiaperRow[];
  if (table === "invites") db.invites = rows as unknown as InviteRow[];
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
  if (table !== "feeds") return null;
  if (row.ended_at != null && String(row.ended_at) <= String(row.started_at)) {
    return { code: "23514", message: "feeds_ended_after_start" };
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
