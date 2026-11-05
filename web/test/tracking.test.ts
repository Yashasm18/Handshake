import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-tracking-"));
process.env.EASYPOST_API_KEY = "EZAK_production_key";
process.env.EASYPOST_WEBHOOK_SECRET = "wh-secret-é";
delete process.env.RESEND_API_KEY;
delete process.env.GMAIL_USER;
delete process.env.TIMERS_SECRET;

// Real delivery tracking: what each carrier status does to the deal, the scam signs it catches, the
// signed webhook, and who sees what. EasyPost and PayPal are fakes; the rules are real.
const pp = vi.hoisted(() => ({
  createTestCardHold: vi.fn(async (_id: string, _t: string, cents: number) => ({
    id: "ORDER-T",
    status: "COMPLETED",
    purchase_units: [{
      shipping: { name: { full_name: "Bo Buyer" }, address: { address_line_1: "1 Main Street", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131" } },
      payments: { authorizations: [{ id: "AUTH-T", status: "CREATED", amount: { value: (cents / 100).toFixed(2) } }] },
    }],
  })),
  voidHold: vi.fn(async () => ({})),
  captureHold: vi.fn(async (_a: string, cents: number) => ({ id: "CAP-T", status: "COMPLETED", seller_receivable_breakdown: { gross_amount: { value: (cents / 100).toFixed(2) }, paypal_fee: { value: "3.00" }, net_amount: { value: (cents / 100 - 3).toFixed(2) } } })),
  addTracking: vi.fn(async () => ({})),
  payoutSeller: vi.fn(async () => ({ batch_header: { payout_batch_id: "BATCH-T", batch_status: "PENDING" } })),
  getPayoutBatch: vi.fn(async (id: string) => ({ batch_header: { payout_batch_id: id, batch_status: "SUCCESS" }, items: [{ payout_item_id: "I", transaction_status: "SUCCESS" }] })),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));

const T0 = Date.parse("2026-11-05T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
type Detail = { status: string; datetime: string; message?: string; tracking_location?: { city?: string; state?: string; zip?: string } };
const tracker = (status: string, details: Detail[] = [], over: object = {}) => ({ id: "trk_1", mode: "production" as const, tracking_code: "1Z999", status, tracking_details: details, ...over });
const scan = (status: string, at: number, zip = "95131", city = "SAN JOSE") => ({ status, datetime: iso(at), message: `${status} scan`, tracking_location: { city, state: "CA", zip } });

const ep = vi.hoisted(() => ({ createTracker: vi.fn(), getTracker: vi.fn() }));
vi.mock("@/lib/server/easypost", async (orig) => ({ ...(await orig<typeof import("@/lib/server/easypost")>()), ...ep }));

const flows = await import("@/lib/server/flows");
const { saveDeal, getDeal } = await import("@/lib/server/deals");
const { applyTracker } = await import("@/lib/server/tracking");
const { deadlinesFor } = await import("@/lib/deadlines");
const { runTimer } = await import("@/lib/server/timers");
const { publicDeal } = await import("@/lib/server/auth");
const { verifyWebhook } = await import("@/lib/server/easypost");
const { outbox } = await import("@/lib/server/email");
const webhook = (await import("@/app/api/webhooks/easypost/route")).POST;

const flush = () => new Promise((r) => setTimeout(r, 30));
let n = 0;
function base(over: Partial<Deal> = {}): Deal {
  ++n;
  return {
    id: `trk-${n}-xxxxxxxxxxxxxxx`, createdAt: "", updatedAt: "", title: "Switch OLED", priceCents: 20_000, condition: "Used", checklist: [],
    sellerName: "Sam", sellerEmail: "s@example.com", scan: null, status: "SHIPPED", demo: false,
    paypal: { orderId: "O", authorizationId: "AUTH-T" },
    shipTo: { name: "Bo Buyer", line: "1 Main St, San Jose, CA 95131", address: { address_line_1: "1 Main St", postal_code: "95131" } },
    shipment: { carrier: "UPS", trackingNumber: `1Z9${n}A`, labelCheck: null, tracking: { provider: "easypost", test: false, status: "unknown", events: [], flags: [] } },
    clock: { heldAt: iso(T0 - 86_400_000), authorizedAt: iso(T0), reauthorizedAt: iso(T0), shippedAt: iso(T0) },
    events: [],
    contacts: {
      seller: { email: "sam@gmail.com", confirmed: true, token: "seller-token-xxxxxxxxxx", source: "paypal" },
      buyer: { email: "bo@outlook.com", confirmed: true, token: "buyer-token-xxxxxxxxxxx", source: "typed" },
    },
    ...over,
  };
}

beforeEach(() => {
  outbox.length = 0;
  for (const f of [...Object.values(pp), ...Object.values(ep)]) f.mockClear();
});

describe("reading the carrier", () => {
  it("keeps the scans in order, with places, and records the delivery", () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0 + 3e8), scan("in_transit", T0 + 1e8, "38118", "MEMPHIS")]), T0 + 3e8);
    const t = d.shipment!.tracking!;
    expect(t.events.map((e) => e.status)).toEqual(["in_transit", "delivered"]);
    expect(t.events[0].place).toBe("MEMPHIS, CA 38118");
    expect(t).toMatchObject({ status: "delivered", deliveredAt: iso(T0 + 3e8), addressCheck: "match", flags: [] });
  });

  it("flags a delivery to a different ZIP than the buyer's PayPal address", () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0 + 3e8, "10001", "NEW YORK")]));
    expect(d.shipment!.tracking).toMatchObject({ addressCheck: "mismatch", flags: ["WRONG_ZIP"] });
  });

  it("flags a number the carrier still doesn't know a day after shipping, but not straight away", () => {
    const d = base();
    applyTracker(d, tracker("unknown"), T0 + 3_600_000);
    expect(d.shipment!.tracking!.flags).toEqual([]);
    applyTracker(d, tracker("unknown"), T0 + 25 * 3_600_000);
    expect(d.shipment!.tracking!.flags).toEqual(["UNKNOWN_NUMBER"]);
  });

  it("flags a delivery dated before the shipment (a recycled number) and a lost parcel", () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0 - 5 * 86_400_000)]));
    expect(d.shipment!.tracking!.flags).toContain("DELIVERED_BEFORE_SHIPPED");
    const lost = base();
    applyTracker(lost, tracker("failure", [scan("failure", T0 + 1e8)]));
    expect(lost.shipment!.tracking!.flags).toContain("LOST");
  });

  it("test parcels skip the address and timing checks, since their places are made up", () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0 - 5 * 86_400_000, "29401")], { mode: "test" }));
    expect(d.shipment!.tracking).toMatchObject({ test: true, addressCheck: "unknown", flags: [] });
  });

  it("test parcels' fixed old dates are shifted so the last scan lands now, keeping the gaps", () => {
    const d = base();
    const now = T0 + 10 * 86_400_000;
    applyTracker(d, tracker("delivered", [scan("in_transit", T0 - 30 * 86_400_000 - 3_600_000), scan("delivered", T0 - 30 * 86_400_000)], { mode: "test" }), now);
    const t = d.shipment!.tracking!;
    expect(t.deliveredAt).toBe(iso(now));
    expect(t.events.map((e) => e.at)).toEqual([iso(now - 3_600_000), iso(now)]);
    // A repeated update an hour later doesn't push the delivery time (or the buyer's window) later.
    applyTracker(d, tracker("delivered", [scan("in_transit", T0 - 30 * 86_400_000 - 3_600_000), scan("delivered", T0 - 30 * 86_400_000)], { mode: "test" }), now + 3_600_000);
    expect(d.shipment!.tracking!.deliveredAt).toBe(iso(now));
  });

  it("each milestone is announced once, however often the carrier repeats it", () => {
    const d = base();
    expect(applyTracker(d, tracker("out_for_delivery", [scan("out_for_delivery", T0 + 1e8)]))).toEqual(["out_for_delivery"]);
    expect(applyTracker(d, tracker("out_for_delivery", [scan("out_for_delivery", T0 + 1e8)]))).toEqual([]);
    expect(applyTracker(d, tracker("delivered", [scan("delivered", T0 + 2e8)]))).toEqual(["delivered"]);
  });
});

describe("what tracking does to the money", () => {
  it("delivery starts the buyer's 3-day window from the delivery scan", () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0 + 2 * 86_400_000)]));
    expect(deadlinesFor(d)).toEqual([expect.objectContaining({ kind: "AUTO_RELEASE", at: T0 + 5 * 86_400_000 })]);
  });

  it("no payout on silence while it isn't delivered, or when a scam sign shows", () => {
    const moving = base();
    applyTracker(moving, tracker("in_transit", [scan("in_transit", T0 + 1e8)]), T0 + 1e8);
    expect(deadlinesFor(moving).map((x) => x.kind)).toEqual(["TRACKING_CHECK"]);
    const wrong = base();
    applyTracker(wrong, tracker("delivered", [scan("delivered", T0 + 1e8, "10001")]));
    expect(deadlinesFor(wrong)).toEqual([]);
  });

  it("'delivered' alone isn't proof: without a matching ZIP or a verified label, the buyer must confirm", () => {
    const noZip = base();
    applyTracker(noZip, tracker("delivered", [{ status: "delivered", datetime: iso(T0 + 1e8) }]));
    expect(noZip.shipment!.tracking!.addressCheck).toBe("unknown");
    expect(deadlinesFor(noZip)).toEqual([]);
    // A label photo verified against the buyer's PayPal address is positive proof.
    noZip.shipment!.labelCheck = { match: true, read: "", reason: "" };
    expect(deadlinesFor(noZip).map((x) => x.kind)).toEqual(["AUTO_RELEASE"]);
    // Test parcels have made-up places, so they also need the label (or the buyer) to pay out.
    const test = base();
    applyTracker(test, tracker("delivered", [scan("delivered", T0 + 1e8)], { mode: "test" }));
    expect(deadlinesFor(test)).toEqual([]);
  });

  it("the recycled-number check uses a real delivery scan, never a stand-in time", () => {
    const d = base();
    applyTracker(d, tracker("delivered", [], { updated_at: iso(T0 - 9 * 86_400_000) }));
    expect(d.shipment!.tracking!.flags).not.toContain("DELIVERED_BEFORE_SHIPPED");
  });

  it("a number reused on another deal is caught again right before an automatic payout", async () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0)]));
    await saveDeal(d);
    // Another deal shipped the same parcel EARLIER, written with spaces and a dash.
    const spaced = d.shipment!.trackingNumber.toLowerCase().replace(/^(..)(.*)$/, "$1 $2-");
    await saveDeal(base({ shipment: { carrier: "UPS", trackingNumber: spaced, labelCheck: null }, clock: { shippedAt: iso(T0 - 86_400_000) } }));
    expect((await runTimer(d.id, "AUTO_RELEASE", T0 + 4 * 86_400_000)).outcome).toBe("rescheduled");
    const after = (await getDeal(d.id))!;
    expect(after.status).toBe("SHIPPED");
    expect(after.shipment!.tracking!.flags).toContain("REUSED_NUMBER");
    expect(pp.captureHold).not.toHaveBeenCalled();
  });

  it("copying an honest seller's number into a LATER deal can't stall their payout", async () => {
    const honest = base();
    applyTracker(honest, tracker("delivered", [scan("delivered", T0)]));
    honest.shipment!.tracking!.flags = ["REUSED_NUMBER"]; // a stale flag is recomputed, not trusted
    await saveDeal(honest);
    await saveDeal(base({ shipment: { carrier: "UPS", trackingNumber: honest.shipment!.trackingNumber, labelCheck: null }, clock: { shippedAt: iso(T0 + 86_400_000) } }));
    expect((await runTimer(honest.id, "AUTO_RELEASE", T0 + 4 * 86_400_000)).outcome).toBe("done");
    expect((await getDeal(honest.id))!.status).toBe("SETTLED");
  });

  it("a parcel returned to the seller releases the buyer's hold", async () => {
    const d = base();
    applyTracker(d, tracker("return_to_sender", [scan("return_to_sender", T0 + 1e8)]), T0 + 1e8);
    await saveDeal(d);
    expect(deadlinesFor(d).map((x) => x.kind)).toEqual(["RETURNED"]);
    expect((await runTimer(d.id, "RETURNED", T0 + 2e8)).outcome).toBe("done");
    const after = (await getDeal(d.id))!;
    expect(after.status).toBe("RELEASED");
    expect(pp.voidHold).toHaveBeenCalledWith("AUTH-T");
    expect(pp.captureHold).not.toHaveBeenCalled();
  });

  it("the silent release after delivery pays the seller and says why", async () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0)]));
    await saveDeal(d);
    expect((await runTimer(d.id, "AUTO_RELEASE", T0 + 4 * 86_400_000)).outcome).toBe("done");
    const after = (await getDeal(d.id))!;
    expect(after.status).toBe("SETTLED");
    expect(after.events.some((e) => e.text.includes("carrier delivered it"))).toBe(true);
  });

  it("without tracking, the old label-verified rule still applies", () => {
    const d = base({ shipment: { carrier: "UPS", trackingNumber: "1Z", labelCheck: { match: true, read: "", reason: "" } } });
    expect(deadlinesFor(d).map((x) => x.kind)).toEqual(["AUTO_RELEASE"]);
  });

  it("the timer asks the carrier when a webhook went missing", async () => {
    const d = await saveDeal(base({ shipment: { ...base().shipment!, tracking: { provider: "easypost", test: false, status: "in_transit", events: [], flags: [], trackerId: "trk_1", checkedAt: iso(T0) } } }));
    ep.getTracker.mockResolvedValueOnce(tracker("delivered", [scan("delivered", T0 + 4 * 3_600_000)]));
    expect((await runTimer(d.id, "TRACKING_CHECK", T0 + 4 * 3_600_000)).outcome).toBe("done");
    expect((await getDeal(d.id))!.shipment!.tracking!.status).toBe("delivered");
  });
});

describe("shipping", () => {
  async function heldDeal() {
    const d = base({ status: "AWAITING_PAYMENT", shipment: undefined, paypal: {}, clock: undefined });
    await saveDeal(d);
    await flows.fundWithTestCard(d.id, async () => {});
    return d.id;
  }

  it("starts following the parcel the moment it ships", async () => {
    ep.createTracker.mockResolvedValueOnce(tracker("pre_transit", [scan("pre_transit", Date.now())]));
    const id = await heldDeal();
    await flows.ship(id, { carrier: "UPS", trackingNumber: "1ZNEW1" });
    expect(ep.createTracker).toHaveBeenCalledWith("1ZNEW1", "UPS");
    expect((await getDeal(id))!.shipment!.tracking).toMatchObject({ status: "pre_transit", trackerId: "trk_1" });
  });

  it("a number already used on another deal is flagged", async () => {
    ep.createTracker.mockResolvedValue(tracker("in_transit"));
    const first = await heldDeal();
    await flows.ship(first, { carrier: "UPS", trackingNumber: "1ZSAME" });
    const second = await heldDeal();
    await flows.ship(second, { carrier: "UPS", trackingNumber: "1zsame" });
    expect((await getDeal(second))!.shipment!.tracking!.flags).toContain("REUSED_NUMBER");
    ep.createTracker.mockReset();
  });

  it("until EasyPost registers the parcel, the label-verified rule still applies and the timer keeps trying", async () => {
    const d = base({ shipment: { carrier: "UPS", trackingNumber: "1ZPENDING", labelCheck: { match: true, read: "", reason: "" }, tracking: { provider: "easypost", test: true, status: "unknown", events: [], flags: [] } } });
    expect(deadlinesFor(d).map((x) => x.kind).sort()).toEqual(["AUTO_RELEASE", "TRACKING_CHECK"]);
    await saveDeal(d);
    const { EasyPostError } = await import("@/lib/server/easypost");
    ep.createTracker.mockRejectedValueOnce(new EasyPostError("EasyPost 429: rate limited", 429));
    expect((await runTimer(d.id, "TRACKING_CHECK", T0 + 4 * 3_600_000)).outcome).toBe("rescheduled");
    // It waits 3 hours before trying again, rather than hammering EasyPost on every sweep.
    const next = deadlinesFor((await getDeal(d.id))!).find((x) => x.kind === "TRACKING_CHECK")!;
    expect(next.at).toBe(T0 + 7 * 3_600_000);
  });

  it("a number EasyPost rejects outright is treated as made up: the buyer must confirm", async () => {
    const { EasyPostError } = await import("@/lib/server/easypost");
    const d = base({ shipment: { carrier: "UPS", trackingNumber: "NOT-A-PARCEL", labelCheck: { match: true, read: "", reason: "" }, tracking: { provider: "easypost", test: true, status: "unknown", events: [], flags: [] } } });
    await saveDeal(d);
    ep.createTracker.mockRejectedValueOnce(new EasyPostError("EasyPost 422: invalid tracking code", 422));
    await runTimer(d.id, "TRACKING_CHECK", T0 + 4 * 3_600_000);
    const after = (await getDeal(d.id))!;
    expect(after.shipment!.tracking).toMatchObject({ status: "error", flags: ["UNKNOWN_NUMBER"] });
    // Even with a verified label, no payout on silence, and nothing left to retry.
    expect(deadlinesFor(after)).toEqual([]);
  });

  it("if EasyPost is down, the deal still ships and the timer tries again", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    ep.createTracker.mockRejectedValueOnce(new Error("EasyPost 503"));
    const id = await heldDeal();
    await flows.ship(id, { carrier: "UPS", trackingNumber: "1ZDOWN" });
    const d = (await getDeal(id))!;
    expect(d.status).toBe("SHIPPED");
    expect(deadlinesFor(d).map((x) => x.kind)).toContain("TRACKING_CHECK");
  });
});

describe("the EasyPost webhook", () => {
  const sign = (body: string, secret = "wh-secret-é") => `hmac-sha256-hex=${createHmac("sha256", Buffer.from(secret.normalize("NFKD"), "utf8")).update(body, "utf8").digest("hex")}`;
  const post = (body: string, signature?: string) => webhook(new Request("https://h.example/api/webhooks/easypost", { method: "POST", body, headers: signature ? { "x-hmac-signature": signature } : {} }));

  it("checks the signature the way EasyPost's own library does", () => {
    const body = '{"a":1,"weight":12}';
    const theirs = `hmac-sha256-hex=${createHmac("sha256", Buffer.from("wh-secret-é".normalize("NFKD"))).update('{"a":1,"weight":12.0}').digest("hex")}`;
    expect(verifyWebhook(body, theirs, "wh-secret-é")).toBe(true);
    expect(verifyWebhook(body, theirs, "other")).toBe(false);
    expect(verifyWebhook(body, null, "wh-secret-é")).toBe(false);
  });

  it("refuses an unsigned or forged 'delivered' message", async () => {
    const d = await saveDeal(base({ shipment: { ...base().shipment!, tracking: { provider: "easypost", test: false, status: "in_transit", events: [], flags: [], trackerId: "trk_1" } } }));
    const body = JSON.stringify({ description: "tracker.updated", mode: "production", result: tracker("delivered", [scan("delivered", T0 + 1e8)]) });
    expect((await post(body)).status).toBe(401);
    expect((await post(body, sign(body, "attacker"))).status).toBe(401);
    expect((await getDeal(d.id))!.shipment!.tracking!.status).toBe("in_transit");
  });

  it("a signed update moves the deal on and emails the buyer and seller once", async () => {
    const d = await saveDeal(base({ id: "trk-hook-xxxxxxxxxxxxxx", shipment: { ...base().shipment!, tracking: { provider: "easypost", test: false, status: "in_transit", events: [], flags: [], trackerId: "trk_hook" } } }));
    const body = JSON.stringify({ description: "tracker.updated", mode: "production", result: tracker("delivered", [scan("delivered", T0 + 1e8)], { id: "trk_hook" }) });
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await post(body, sign(body))).status).toBe(200);
    await flush();
    expect((await getDeal(d.id))!.shipment!.tracking!.status).toBe("delivered");
    expect(outbox.filter((m) => m.to === "bo@outlook.com").map((m) => m.subject)).toEqual(["Switch OLED was delivered. Check it."]);
    expect(outbox.filter((m) => m.to === "sam@gmail.com").map((m) => m.subject)).toEqual(["Delivered: Switch OLED"]);
  });

  it("a test-mode event can't touch a production setup", async () => {
    const d = await saveDeal(base({ shipment: { ...base().shipment!, tracking: { provider: "easypost", test: false, status: "in_transit", events: [], flags: [], trackerId: "trk_mode" } } }));
    const body = JSON.stringify({ description: "tracker.updated", mode: "test", result: tracker("delivered", [], { id: "trk_mode" }) });
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await getDeal(d.id))!.shipment!.tracking!.status).toBe("in_transit");
  });

  it("a suspicious delivery warns the buyer instead of starting the countdown", async () => {
    const d = base();
    applyTracker(d, tracker("delivered", [scan("delivered", T0 + 1e8, "10001")]));
    const { trackingMessages } = await import("@/lib/server/notify");
    const m = trackingMessages(d, "delivered");
    expect(m.buyer!.subject).toBe("Check this delivery: Switch OLED");
    expect(m.seller).toBeUndefined();
  });
});

describe("who sees the parcel", () => {
  it("the parties see the timeline; a stranger sees how far along it is, not the number or places", () => {
    const d = base();
    applyTracker(d, tracker("in_transit", [scan("in_transit", T0 + 1e8, "38118", "MEMPHIS")]));
    const party = publicDeal(d, { seller: true, buyer: false });
    expect(party.shipment!.tracking!.events).toHaveLength(1);
    expect(JSON.stringify(party)).not.toContain("trk_1");
    const stranger = publicDeal(d, { seller: false, buyer: false });
    expect(stranger.shipment!.trackingNumber).toBe("");
    expect(stranger.shipment!.tracking).toMatchObject({ status: "in_transit", events: [], flags: [] });
    expect(JSON.stringify(stranger)).not.toContain("MEMPHIS");
  });
});
