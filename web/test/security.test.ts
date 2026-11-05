import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

// Set before the server modules load: deals.ts picks its data file at import time.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-security-"));
const { publicDeal } = await import("@/lib/server/auth");
const { labelMatches } = await import("@/lib/server/checks");

const deal = (): Deal => ({
  id: "sec-xxxxxxxxxxxxxxxxxx", createdAt: "", updatedAt: "", title: "Switch OLED", priceCents: 23_000, condition: "Used",
  checklist: [], sellerName: "Sam", sellerEmail: "seller@example.com", scan: null, status: "CLAIM_OPEN", demo: false,
  sellerToken: "seller-secret", buyerToken: "buyer-secret", floorCents: 19_000, pendingOfferCents: 21_500,
  paypal: { orderId: "ORDER-1", authorizationId: "AUTH-1", payNonce: "nonce", buyerEmail: "buyer@example.com" },
  shipTo: { name: "Bo Buyer", line: "1 Main St, San Jose, CA 95131" },
  shipment: { carrier: "UPS", trackingNumber: "1Z", labelCheck: { match: true, read: "Bo Buyer, 1 Main St", reason: "" } },
  claim: { photo: "data:image/png;base64,PRIVATE", note: "my note", finding: "Cracked", damagedPart: "Joy-Con", verdict: "MINOR_ISSUE", partPriceCents: 4_999, refundCents: 4_999, captureCents: 18_001, buyerAccepted: false, sellerAccepted: false } as Deal["claim"],
  negotiation: {
    status: "AGREED", askingCents: 23_000, fair: null, startedAt: "", maxCents: 21_500,
    turns: [{ by: "buyer", offerCents: 21_500, message: "", at: "", clamped: true }, { by: "seller", offerCents: 19_000, message: "", at: "", clamped: true }],
  },
  events: [{ at: "", actor: "paypal", text: "$230.00 is held by PayPal.", ref: "AUTH-1" }, { at: "", actor: "paypal", text: "Paid Sam.", ref: "BATCH-77" }],
});

const OUTSIDER = { seller: false, buyer: false };
const SELLER = { seller: true, buyer: false };
const BUYER = { seller: false, buyer: true };

describe("privacy: what each person can see", () => {
  it("credentials and the seller's email never leave the server, for anyone", () => {
    for (const viewer of [OUTSIDER, SELLER, BUYER]) {
      const json = JSON.stringify(publicDeal(deal(), viewer));
      for (const secret of ["seller-secret", "buyer-secret", "seller@example.com", "nonce"]) expect(json).not.toContain(secret);
    }
  });

  it("a stranger with the link sees the item, not the people, address, PayPal ids or claim photo", () => {
    const v = publicDeal(deal(), OUTSIDER);
    const json = JSON.stringify(v);
    for (const p of ["Bo Buyer", "1 Main St", "ORDER-1", "AUTH-1", "BATCH-77", "buyer@example.com", "PRIVATE", "my note"]) expect(json).not.toContain(p);
    expect(v.title).toBe("Switch OLED");
    expect(v.events.map((e) => e.text)).toEqual(["$230.00 is held by PayPal.", "Paid Sam."]);
    expect(v.negotiation?.turns).toEqual([]);
  });

  it("the seller's floor is shown only to the seller, the buyer's max only to the buyer", () => {
    expect(publicDeal(deal(), SELLER).floorCents).toBe(19_000);
    expect(publicDeal(deal(), BUYER).floorCents).toBeUndefined();
    expect(publicDeal(deal(), BUYER).negotiation?.maxCents).toBe(21_500);
    expect(publicDeal(deal(), SELLER).negotiation?.maxCents).toBeUndefined();
  });

  it("an offer pinned at its owner's limit is only flagged to that owner", () => {
    const toSeller = publicDeal(deal(), SELLER).negotiation!.turns;
    expect(toSeller.find((t) => t.by === "buyer")?.clamped).toBeUndefined();
    expect(toSeller.find((t) => t.by === "seller")?.clamped).toBe(true);
    const toBuyer = publicDeal(deal(), BUYER).negotiation!.turns;
    expect(toBuyer.find((t) => t.by === "seller")?.clamped).toBeUndefined();
  });

  it("the parties still see the PayPal ids in their activity log", () => {
    expect(publicDeal(deal(), BUYER).events.map((e) => e.ref)).toEqual(["AUTH-1", "BATCH-77"]);
    expect(publicDeal(deal(), SELLER).events[1].ref).toBe("BATCH-77");
  });

  it("in an in-person deal the seller never sees the buyer's address, and handover codes never leave the server", () => {
    const meet = { ...deal(), handoff: "meet" as const, meetup: { codeHash: "hash-of-code", tokenHash: "hash-of-token", expiresAt: "", attempts: 0 } };
    expect(publicDeal(meet, SELLER).shipTo).toBeUndefined();
    expect(publicDeal(meet, BUYER).shipTo?.line).toContain("1 Main St");
    for (const viewer of [OUTSIDER, SELLER, BUYER]) expect(JSON.stringify(publicDeal(meet, viewer))).not.toContain("hash-of");
  });

  it("the pending offer amount is never exposed", () => {
    for (const viewer of [OUTSIDER, SELLER, BUYER]) expect(publicDeal(deal(), viewer)).not.toHaveProperty("pendingOfferCents");
  });
});

describe("label check: the model reads, code decides", () => {
  const label = { readable: true, recipient_name: "Bo", street: "1 Main St.", city: "San Jose", state: "CA", postal_code: "95131", carrier: "UPS", tracking_number: "1Z" };
  const address = { address_line_1: "1 Main Street", postal_code: "95131" };

  it("matches street abbreviations and ZIP+4", () => {
    expect(labelMatches(label, address).match).toBe(true);
    expect(labelMatches({ ...label, postal_code: "95131-0042" }, address).match).toBe(true);
  });

  it("stops a label with the right street in the wrong ZIP", () => {
    expect(labelMatches({ ...label, postal_code: "10001" }, address).match).toBe(false);
  });

  it("stops a label with the right ZIP on a different street", () => {
    expect(labelMatches({ ...label, street: "900 Reship Ave" }, address).match).toBe(false);
  });

  it("never passes a label it couldn't read", () => {
    expect(labelMatches({ ...label, readable: false }, address)).toMatchObject({ match: false });
  });
});

describe("PayPal client: retries can't move money twice", () => {
  const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: init.body as string });
      if (url.endsWith("/oauth2/token")) return Response.json({ access_token: `tok-${(init.headers as Record<string, string>).Authorization.slice(6, 18)}`, expires_in: 3600 });
      if (url.includes("FAIL")) return Response.json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "AUTHORIZATION_VOIDED", description: "Authorization was voided." }] }, { status: 422, headers: { "paypal-debug-id": "dbg-1" } });
      return Response.json({ id: "X", batch_header: { payout_batch_id: "B" } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const api = () => calls.filter((c) => !c.url.endsWith("/oauth2/token"));

  it("a capture uses one idempotency key per authorization, so a retry returns the first capture", async () => {
    const { captureHold } = await import("@/lib/server/paypal");
    await captureHold("AUTH-9", 21_000, "HS-1", "note");
    await captureHold("AUTH-9", 21_000, "HS-1", "note");
    const [a, b] = api();
    expect(a.headers["PayPal-Request-Id"]).toBe("capture-AUTH-9");
    expect(b.headers["PayPal-Request-Id"]).toBe("capture-AUTH-9");
    expect(JSON.parse(a.body!)).toMatchObject({ amount: { currency_code: "USD", value: "210.00" }, final_capture: true });
  });

  it("a payout uses one key per deal", async () => {
    const { payoutSeller } = await import("@/lib/server/paypal");
    await payoutSeller("deal-7", { type: "EMAIL", email: "s@example.com" }, 22_355, "Payment");
    expect(api()[0].headers["PayPal-Request-Id"]).toBe("payout-deal-7");
    expect(JSON.parse(api()[0].body!).items[0].amount).toEqual({ currency: "USD", value: "223.55" });
  });

  it("the payout key and batch id are fixed per attempt, so a retried request can never pay twice", async () => {
    const { payoutSeller } = await import("@/lib/server/paypal");
    await payoutSeller("deal-9", { type: "EMAIL", email: "s@example.com" }, 1_000, "Payment");
    await payoutSeller("deal-9", { type: "EMAIL", email: "s@example.com" }, 1_000, "Payment", 1);
    const [a, b] = api();
    expect(a.headers["PayPal-Request-Id"]).toBe("payout-deal-9");
    expect(JSON.parse(a.body!).sender_batch_header.sender_batch_id).toBe("payout-deal-9");
    expect(b.headers["PayPal-Request-Id"]).toBe("payout-deal-9-r1");
  });

  it("with a separate payouts app, only payouts use it; holds and captures stay on the main app", async () => {
    process.env.PAYPAL_PAYOUT_CLIENT_ID = "payout-app";
    process.env.PAYPAL_PAYOUT_CLIENT_SECRET = "payout-secret";
    const { payoutSeller, captureHold, getPayoutBatch } = await import("@/lib/server/paypal");
    await payoutSeller("deal-10", { type: "EMAIL", email: "s@example.com" }, 1_000, "Payment");
    await getPayoutBatch("B-1");
    await captureHold("AUTH-10", 1_000, "HS-10", "note");
    const bearer = (path: string) => calls.find((c) => c.url.includes(path))!.headers.Authorization;
    const basic = (id: string) => "Basic " + Buffer.from(`${id}:${id === "payout-app" ? "payout-secret" : process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
    const tokens = calls.filter((c) => c.url.endsWith("/oauth2/token")).map((c) => c.headers.Authorization);
    expect(tokens).toContain(basic("payout-app"));
    expect(bearer("/v1/payments/payouts")).toBe(bearer("/v1/payments/payouts/B-1"));
    expect(bearer("/v1/payments/payouts")).not.toBe(bearer("/capture"));
    delete process.env.PAYPAL_PAYOUT_CLIENT_ID;
    delete process.env.PAYPAL_PAYOUT_CLIENT_SECRET;
  });

  it("a seller signed in with PayPal is paid by payer id, into their own account", async () => {
    const { payoutSeller } = await import("@/lib/server/paypal");
    await payoutSeller("deal-8", { type: "PAYER_ID", payerId: "SELLERPAYER1" }, 10_000, "Payment");
    expect(JSON.parse(api()[0].body!).items[0]).toMatchObject({ recipient_type: "PAYPAL_ID", receiver: "SELLERPAYER1" });
  });

  it("every other write still gets a unique key, and reads get none", async () => {
    const { voidHold, getOrder } = await import("@/lib/server/paypal");
    await voidHold("A1");
    await voidHold("A1");
    await getOrder("O1");
    const [v1, v2, g] = api();
    expect(v1.headers["PayPal-Request-Id"]).toBeTruthy();
    expect(v1.headers["PayPal-Request-Id"]).not.toBe(v2.headers["PayPal-Request-Id"]);
    expect(g.headers["PayPal-Request-Id"]).toBeUndefined();
  });

  it("PayPal's errors keep their issue code and debug id for support", async () => {
    const { voidHold, PayPalError } = await import("@/lib/server/paypal");
    const err = await voidHold("FAIL").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ status: 422, issue: "AUTHORIZATION_VOIDED", debugId: "dbg-1", message: "Authorization was voided." });
  });
});

describe("internal timer API", () => {
  const req = (auth?: string) => new Request("http://x/api/internal/timers", { headers: auth ? { authorization: auth } : {} });
  // Render sets a real TIMERS_SECRET during builds; each test controls its own and restores the original.
  const original = process.env.TIMERS_SECRET;
  beforeEach(() => { delete process.env.TIMERS_SECRET; });
  afterEach(() => { if (original === undefined) delete process.env.TIMERS_SECRET; else process.env.TIMERS_SECRET = original; });

  it("doesn't exist when no secret is configured", async () => {
    const { GET } = await import("@/app/api/internal/timers/route");
    expect((await GET(req("Bearer anything"))).status).toBe(404);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env.TIMERS_SECRET = "s3cret-value-1234";
    const { GET } = await import("@/app/api/internal/timers/route");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer s3cret-value-1235"))).status).toBe(401);
    expect((await GET(req("Bearer s3cret"))).status).toBe(401);
  });

  it("answers the workflow when the secret matches", async () => {
    process.env.TIMERS_SECRET = "s3cret-value-1234";
    const { GET } = await import("@/app/api/internal/timers/route");
    const res = await GET(req("Bearer s3cret-value-1234"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("due");
  });
});
