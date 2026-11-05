import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Deal } from "../types";
import { type Db, getDb } from "./db";

// Where deals live. In production that's Postgres (DATABASE_URL): one row per deal, the deal itself in a
// JSONB column, with the fields we look things up by (status, the two PayPal accounts, the parcel) in
// indexed columns. Without a database (local development) a JSON file is used instead. Every other part
// of Handshake only uses the functions below, so it doesn't care which.
const FILE = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "deals.json");

// Tracking numbers compared without spaces, dashes or case: "1Z 999-AA1" and "1z999aa1" are one parcel.
export const normalizeTracking = (n?: string) => (n ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

type Store = {
  get(id: string): Promise<Deal | null>;
  save(deal: Deal): Promise<void>;
  all(): Promise<Deal[]>;
  open(): Promise<Deal[]>;
  forAccount(payerId: string): Promise<Deal[]>;
  byTracker(trackerId: string, code: string): Promise<Deal | null>;
  withTrackingNumber(normalized: string): Promise<Deal[]>;
  lock<T>(id: string, fn: () => Promise<T>): Promise<T>;
};

const DONE: Deal["status"][] = ["SETTLED", "RELEASED"];

// ── JSON file (local development) ────────────────────────────────────────

let fileDeals: Map<string, Deal> | null = null;
let writing: Promise<void> = Promise.resolve();

async function readFileDeals(): Promise<Deal[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Deal[];
  } catch {
    return [];
  }
}

async function loadFile() {
  fileDeals ??= new Map((await readFileDeals()).map((d) => [d.id, d]));
  return fileDeals;
}

function persistFile() {
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    // Write then rename, so a crash mid-write never leaves a half-written file behind.
    await writeFile(`${FILE}.tmp`, JSON.stringify([...fileDeals!.values()], null, 2));
    await rename(`${FILE}.tmp`, FILE);
  });
  return writing;
}

const fileStore: Store = {
  get: async (id) => (await loadFile()).get(id) ?? null,
  async save(deal) {
    (await loadFile()).set(deal.id, deal);
    await persistFile();
  },
  all: async () => [...(await loadFile()).values()],
  open: async () => [...(await loadFile()).values()].filter((d) => !DONE.includes(d.status)),
  forAccount: async (p) => [...(await loadFile()).values()].filter((d) => d.seller?.payerId === p || d.buyer?.payerId === p),
  byTracker: async (trackerId, code) =>
    [...(await loadFile()).values()].find(
      (d) => d.status === "SHIPPED" && (d.shipment?.tracking?.trackerId === trackerId || (!d.shipment?.tracking?.trackerId && normalizeTracking(d.shipment?.trackingNumber) === normalizeTracking(code))),
    ) ?? null,
  withTrackingNumber: async (n) => [...(await loadFile()).values()].filter((d) => d.status !== "RELEASED" && normalizeTracking(d.shipment?.trackingNumber) === n),
  lock: (_id, fn) => fn(),
};

// ── Postgres (production) ────────────────────────────────────────────────

const SCHEMA = `
create table if not exists deals (
  id text primary key,
  data jsonb not null,
  status text not null,
  seller_payer_id text,
  buyer_payer_id text,
  tracker_id text,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_open_idx on deals (status) where status not in ('SETTLED', 'RELEASED');
create index if not exists deals_seller_idx on deals (seller_payer_id) where seller_payer_id is not null;
create index if not exists deals_buyer_idx on deals (buyer_payer_id) where buyer_payer_id is not null;
create index if not exists deals_tracker_idx on deals (tracker_id) where tracker_id is not null;
create index if not exists deals_tracking_number_idx on deals (tracking_number) where tracking_number is not null;
create table if not exists handshake_meta (key text primary key, value text not null, at timestamptz not null default now());
`;

const validDate = (iso: string) => (iso && Number.isFinite(Date.parse(iso)) ? iso : new Date().toISOString());

function row(d: Deal) {
  return [
    d.id,
    JSON.stringify(d),
    d.status,
    d.seller?.payerId ?? null,
    d.buyer?.payerId ?? null,
    d.shipment?.tracking?.trackerId ?? null,
    d.shipment?.trackingNumber ? normalizeTracking(d.shipment.trackingNumber) : null,
    validDate(d.createdAt),
    validDate(d.updatedAt),
  ];
}

const UPSERT = `insert into deals (id, data, status, seller_payer_id, buyer_payer_id, tracker_id, tracking_number, created_at, updated_at)
values ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9)
on conflict (id) do update set data = excluded.data, status = excluded.status, seller_payer_id = excluded.seller_payer_id,
  buyer_payer_id = excluded.buyer_payer_id, tracker_id = excluded.tracker_id, tracking_number = excluded.tracking_number,
  updated_at = excluded.updated_at`;

// The one-time import never overwrites a deal already in the database.
const INSERT_IF_NEW = `insert into deals (id, data, status, seller_payer_id, buyer_payer_id, tracker_id, tracking_number, created_at, updated_at)
values ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing`;

const pgReady = new WeakMap<Db, Promise<void>>();

// Creates the tables on first use, and the first time production starts with a database, copies in the
// deals from the old JSON file (once, under a lock, so two servers starting together can't both do it).
// The file itself is left in place as a backup.
function ready(db: Db) {
  let p = pgReady.get(db);
  if (!p) {
    p = (async () => {
      await db.query(SCHEMA);
      await db.lock("handshake:import-json", async () => {
        const done = await db.query("select 1 from handshake_meta where key = 'imported_json'");
        if (done.rows.length) return;
        const old = await readFileDeals();
        for (const d of old) await db.query(INSERT_IF_NEW, row(d));
        await db.query("insert into handshake_meta (key, value) values ('imported_json', $1) on conflict do nothing", [String(old.length)]);
        if (old.length) console.log(`postgres: imported ${old.length} deals from ${FILE}`);
      });
    })();
    p.catch(() => pgReady.delete(db));
    pgReady.set(db, p);
  }
  return p;
}

function pgStore(db: Db): Store {
  const deals = async (sql: string, params: unknown[] = []) => {
    await ready(db);
    return (await db.query<{ data: Deal }>(sql, params)).rows.map((r) => (typeof r.data === "string" ? (JSON.parse(r.data) as Deal) : r.data));
  };
  return {
    get: async (id) => (await deals("select data from deals where id = $1", [id]))[0] ?? null,
    async save(deal) {
      await ready(db);
      await db.query(UPSERT, row(deal));
    },
    all: () => deals("select data from deals order by updated_at desc"),
    open: () => deals("select data from deals where status not in ('SETTLED', 'RELEASED')"),
    forAccount: (p) => deals("select data from deals where seller_payer_id = $1 or buyer_payer_id = $1 order by updated_at desc", [p]),
    byTracker: async (trackerId, code) =>
      (await deals("select data from deals where status = 'SHIPPED' and (tracker_id = $1 or (tracker_id is null and tracking_number = $2)) limit 1", [trackerId, normalizeTracking(code)]))[0] ?? null,
    withTrackingNumber: (n) => deals("select data from deals where tracking_number = $1 and status <> 'RELEASED'", [n]),
    lock: async (id, fn) => {
      await ready(db);
      return db.lock(`deal:${id}`, fn);
    },
  };
}

const store = (): Store => {
  const db = getDb();
  return db ? pgStore(db) : fileStore;
};

// 128-bit ids: a deal link can't be guessed or enumerated.
export const newId = () => randomBytes(16).toString("base64url");
export const newToken = () => randomBytes(32).toString("base64url");

export const allDeals = () => store().all();
// Deals that can still change: the deadline sweep only looks at these.
export const openDeals = () => store().open();
// Every deal this PayPal account is selling or buying (My deals).
export const dealsForAccount = (payerId: string) => store().forAccount(payerId);
// The shipped deal a carrier update belongs to.
export const dealByTracker = (trackerId: string, code: string) => store().byTracker(trackerId, code);
// Live deals that shipped this tracking number (for the reused-number check).
export const dealsWithTrackingNumber = (n: string) => store().withTrackingNumber(normalizeTracking(n));

export async function getDeal(id: string) {
  return store().get(id);
}

export async function saveDeal(deal: Deal) {
  await store().save(deal);
  return deal;
}

// Serialize work per deal so two clicks can never run the same money step twice: queued in this server,
// and locked in Postgres across servers. Steps that move money save as they go (see flows.settle), so a
// later failure in the same step never loses the record of money that already moved.
const locks = new Map<string, Promise<unknown>>();
export async function withDeal<T>(id: string, fn: (deal: Deal) => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(() =>
    store().lock(id, async () => {
      const deal = await getDeal(id);
      if (!deal) throw new HttpError(404, "This deal doesn't exist.");
      const before = deal.status;
      const out = await fn(deal);
      deal.updatedAt = new Date().toISOString();
      await saveDeal(deal);
      // Every status change, from a click or a timer, emails whoever needs to act next. In the background,
      // so a slow or failing email can never hold up or undo a money step.
      if (deal.status !== before) announce(deal, before);
      return out;
    }),
  );
  const tail = next.catch(() => {});
  locks.set(id, tail);
  // Drop the entry once nothing is queued behind it, so unknown or old ids don't pile up.
  tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return next;
}

export function announce(deal: Deal, prev: Deal["status"] | "NEW") {
  const snapshot = structuredClone(deal);
  import("./notify").then((m) => m.notifyChange(snapshot, prev)).catch((e) => console.error("notify", deal.id, e));
}

export function log(deal: Deal, actor: Deal["events"][number]["actor"], text: string, ref?: string) {
  deal.events.push({ at: new Date().toISOString(), actor, text, ref });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
