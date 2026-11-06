import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

// The production database path, on a real Postgres engine (PGlite): the schema and indexes, the one-time
// import of the old JSON file, the indexed lookups, per-deal locking, and that a money step's record
// survives a later failure in the same step.
const dir = mkdtempSync(path.join(tmpdir(), "hs-pg-"));
process.env.DATA_DIR = dir;

const old = (id: string, status: Deal["status"] = "AWAITING_PAYMENT"): Deal => ({
  id, createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z", title: "Old deal", priceCents: 1000, condition: "", checklist: [],
  sellerName: "Old", sellerEmail: "", scan: null, status, demo: false, paypal: {}, events: [],
});
// The JSON file a server had before Postgres: imported once on first start.
writeFileSync(path.join(dir, "deals.json"), JSON.stringify([old("from-file-1-xxxxxxxxxxxxx"), old("from-file-2-xxxxxxxxxxxxx", "SETTLED")]));

const pp = vi.hoisted(() => ({
  createTestCardHold: vi.fn(async (_id: string, _t: string, cents: number) => ({
    id: "ORDER-T",
    status: "COMPLETED",
    purchase_units: [{ shipping: { name: { full_name: "Bo" }, address: { address_line_1: "1 Main St", postal_code: "95131" } }, payments: { authorizations: [{ id: "AUTH-T", status: "CREATED", amount: { value: (cents / 100).toFixed(2) } }] } }],
  })),
  captureHold: vi.fn(async (_a: string, cents: number) => ({ id: "CAP-T", status: "COMPLETED", seller_receivable_breakdown: { gross_amount: { value: (cents / 100).toFixed(2) }, paypal_fee: { value: "1.00" }, net_amount: { value: (cents / 100 - 1).toFixed(2) } } })),
  addTracking: vi.fn(async () => ({})),
  payoutSeller: vi.fn(async () => ({ batch_header: { payout_batch_id: "B1", batch_status: "PENDING" } })),
  getPayoutBatch: vi.fn(async (id: string) => ({ batch_header: { payout_batch_id: id, batch_status: "SUCCESS" }, items: [{ payout_item_id: "I", transaction_status: "SUCCESS" }] })),
  voidHold: vi.fn(async () => ({})),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));

const { pgliteDb } = await import("./pglite");
const { setDb, usingPostgres } = await import("@/lib/server/db");
const db = await pgliteDb();
setDb(db);
const store = await import("@/lib/server/deals");
const flows = await import("@/lib/server/flows");

let n = 0;
const fresh = (over: Partial<Deal> = {}): Deal => ({ ...old(`pg-${++n}-xxxxxxxxxxxxxxxxx`), title: "Switch", priceCents: 20_000, sellerEmail: "s@example.com", ...over });
const rows = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows as Record<string, unknown>[];

beforeAll(async () => {
  await store.getDeal("warm-up-xxxxxxxxxxxxxxxx");
});

describe("Postgres store", () => {
  it("is the store in use, with the deals table and its indexes", async () => {
    expect(usingPostgres()).toBe(true);
    const idx = (await rows("select indexname from pg_indexes where tablename = 'deals'")).map((r) => r.indexname);
    expect(idx).toEqual(expect.arrayContaining(["deals_pkey", "deals_open_idx", "deals_seller_idx", "deals_buyer_idx", "deals_tracker_idx", "deals_tracking_number_idx"]));
  });

  it("imported the old JSON file once, on first start", async () => {
    expect((await store.getDeal("from-file-1-xxxxxxxxxxxxx"))?.title).toBe("Old deal");
    expect(await rows("select value from handshake_meta where key = 'imported_json'")).toEqual([expect.objectContaining({ value: "2" })]);
    // The import is recorded, so later starts skip it; and it only ever inserts missing deals.
    const d = (await store.getDeal("from-file-1-xxxxxxxxxxxxx"))!;
    await store.saveDeal({ ...d, title: "Changed in Postgres" });
    expect(await rows("select count(*)::int as n from deals where id like 'from-file-%'")).toEqual([{ n: 2 }]);
    expect((await store.getDeal("from-file-1-xxxxxxxxxxxxx"))?.title).toBe("Changed in Postgres");
  });

  it("stores the whole deal and fills the indexed columns", async () => {
    const d = fresh({
      status: "SHIPPED",
      seller: { payerId: "SELLER1", name: "S", verified: true },
      buyer: { payerId: "BUYER1", name: "B", verified: false },
      shipment: { carrier: "UPS", trackingNumber: "1z 999-aa1", labelCheck: null, tracking: { provider: "easypost", test: false, status: "in_transit", events: [], flags: [], trackerId: "trk_9" } },
    });
    await store.saveDeal(d);
    expect(await store.getDeal(d.id)).toEqual(d);
    expect(await rows("select status, seller_payer_id, buyer_payer_id, tracker_id, tracking_number from deals where id = $1", [d.id])).toEqual([
      { status: "SHIPPED", seller_payer_id: "SELLER1", buyer_payer_id: "BUYER1", tracker_id: "trk_9", tracking_number: "1Z999AA1" },
    ]);
  });

  it("answers My deals, carrier updates, reuse checks and the sweep from indexes", async () => {
    const sold = fresh({ seller: { payerId: "ACC-1", name: "A", verified: true } });
    const bought = fresh({ buyer: { payerId: "ACC-1", name: "A", verified: true } });
    const other = fresh({ seller: { payerId: "ACC-2", name: "Z", verified: true } });
    const shipped = fresh({ status: "SHIPPED", shipment: { carrier: "USPS", trackingNumber: "EZ400", labelCheck: null } });
    const done = fresh({ status: "SETTLED" });
    for (const d of [sold, bought, other, shipped, done]) await store.saveDeal(d);
    expect((await store.dealsForAccount("ACC-1")).map((d) => d.id).sort()).toEqual([sold.id, bought.id].sort());
    expect((await store.dealByTracker("trk_unknown", "ez-400"))?.id).toBe(shipped.id);
    expect((await store.dealsWithTrackingNumber("e z 4 0 0")).map((d) => d.id)).toEqual([shipped.id]);
    const open = (await store.openDeals()).map((d) => d.id);
    expect(open).toContain(shipped.id);
    expect(open).not.toContain(done.id);
  });

  it("two clicks on the same deal run one after the other, never interleaved", async () => {
    const d = fresh({ priceCents: 0 });
    await store.saveDeal(d);
    await Promise.all(Array.from({ length: 20 }, () => store.withDeal(d.id, async (x) => {
      const before = x.priceCents;
      await new Promise((r) => setTimeout(r, 1));
      x.priceCents = before + 1;
    })));
    expect((await store.getDeal(d.id))!.priceCents).toBe(20);
  });

  it("a test run refuses to connect to a real database, even with DATABASE_URL set (as in Render's build)", async () => {
    const { getDb } = await import("@/lib/server/db");
    process.env.DATABASE_URL = "postgres://prod.example/handshake";
    setDb(undefined as never);
    expect(() => getDb()).toThrow("Tests must never connect to a real database");
    delete process.env.DATABASE_URL;
    setDb(db);
  });

  it("a test can't reach a real service over the network unless it mocks it", async () => {
    await expect(fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token")).rejects.toThrow("Tests may not reach real services (api-m.sandbox.paypal.com)");
    await expect(fetch("https://openrouter.ai/api/v1/credits")).rejects.toThrow("openrouter.ai");
  });

  it("a fetched deal is a copy: changing it saves nothing until saveDeal", async () => {
    const d = fresh();
    await store.saveDeal(d);
    const copy = (await store.getDeal(d.id))!;
    copy.title = "Not saved";
    expect((await store.getDeal(d.id))!.title).toBe("Switch");
  });

  it("a full deal settles on Postgres, and money that moved stays recorded if a later step fails", async () => {
    const d = fresh();
    await store.saveDeal(d);
    await flows.fundWithTestCard(d.id, async () => {});
    await flows.ship(d.id, { carrier: "UPS", trackingNumber: "1ZPG" });
    pp.payoutSeller.mockRejectedValueOnce(new Error("PayPal down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    await flows.confirmDelivery(d.id);
    // The capture was saved the moment it happened; the payout is queued, not lost.
    const mid = (await rows("select data from deals where id = $1", [d.id]))[0].data as Deal;
    expect(mid.paypal).toMatchObject({ captureId: "CAP-T", payoutAttempts: 1 });
    expect(mid.status).toBe("SHIPPED");
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
  });
});
