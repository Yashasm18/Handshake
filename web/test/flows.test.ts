import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-flows-"));

// The deal state machine end to end, with PayPal, the AI reviewers and Channel3 replaced by fakes.
// What's under test is which money moves happen, for how much, and in which states they're refused.
const pp = vi.hoisted(() => ({
  createTestCardHold: vi.fn(async (_id: string, _title: string, cents: number) => ({
    id: "ORDER-T",
    status: "COMPLETED",
    payer: { email_address: "buyer@example.com" },
    purchase_units: [{
      shipping: { name: { full_name: "Bo Buyer" }, address: { address_line_1: "1 Main Street", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131" } },
      payments: { authorizations: [{ id: "AUTH-T", status: "CREATED", amount: { value: (cents / 100).toFixed(2) } }] },
    }],
  })),
  voidHold: vi.fn(async () => ({})),
  captureHold: vi.fn(async (_a: string, cents: number) => ({
    id: "CAP-T",
    status: "COMPLETED",
    seller_receivable_breakdown: { gross_amount: { value: (cents / 100).toFixed(2) }, paypal_fee: { value: "1.00" }, net_amount: { value: (cents / 100 - 1).toFixed(2) } },
  })),
  addTracking: vi.fn(async () => ({})),
  payoutSeller: vi.fn(async () => ({ batch_header: { payout_batch_id: "BATCH-T", batch_status: "PENDING" } })),
  getPayoutBatch: vi.fn(async (id: string) => ({ batch_header: { payout_batch_id: id, batch_status: "SUCCESS" }, items: [{ payout_item_id: "ITEM", transaction_status: "SUCCESS" }] })),
  authorizeOrder: vi.fn(async (id: string) => ({
    id,
    status: "COMPLETED",
    payer: { payer_id: "BUYERPAYER1", email_address: "bo@example.com", name: { given_name: "Bo", surname: "Buyer" } },
    purchase_units: [{ payments: { authorizations: [{ id: "AUTH-P", status: "CREATED", amount: { value: "230.00" } }] } }],
  })),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));

const ai = vi.hoisted(() => ({
  readLabel: vi.fn(),
  reviewClaim: vi.fn(),
}));
vi.mock("@/lib/server/checks", async (orig) => ({ ...(await orig<typeof import("@/lib/server/checks")>()), ...ai }));

const c3 = vi.hoisted(() => ({ searchComps: vi.fn(async () => [] as { id: string; title: string; priceCents: number }[]) }));
vi.mock("@/lib/server/channel3", async (orig) => ({ ...(await orig<typeof import("@/lib/server/channel3")>()), ...c3 }));

const neg = vi.hoisted(() => ({ runNegotiation: vi.fn() }));
vi.mock("@/lib/server/negotiate", async (orig) => ({ ...(await orig<typeof import("@/lib/server/negotiate")>()), ...neg }));

const flows = await import("@/lib/server/flows");
const { saveDeal, getDeal } = await import("@/lib/server/deals");

const LABEL = { readable: true, recipient_name: "Bo Buyer", street: "1 Main St", city: "San Jose", state: "CA", postal_code: "95131-1234", carrier: "UPS GROUND", tracking_number: "1Z 999 AA1" };
const becomeBuyer = async () => {};
let n = 0;

async function newDeal(over: Partial<Deal> = {}) {
  const deal: Deal = {
    id: `flow-${++n}-xxxxxxxxxxxxxx`, createdAt: "", updatedAt: "", title: "Nintendo Switch OLED", priceCents: 23_000, condition: "Used",
    checklist: ["Both Joy-Cons"], sellerName: "Sam", sellerEmail: "seller@example.com", scan: null, status: "AWAITING_PAYMENT", demo: false,
    paypal: {}, events: [], ...over,
  };
  await saveDeal(deal);
  return deal.id;
}

async function heldDeal(over: Partial<Deal> = {}) {
  const id = await newDeal(over);
  await flows.fundWithTestCard(id, becomeBuyer);
  return id;
}

async function shippedDeal() {
  const id = await heldDeal();
  ai.readLabel.mockResolvedValueOnce(LABEL);
  await flows.ship(id, { label: "data:image/png;base64,AAAA", carrier: "", trackingNumber: "" });
  return id;
}

const damage = (over = {}) => ({
  photo_shows_item: true, finding: "The left Joy-Con is cracked.", damaged_part: "left Joy-Con", verdict: "MINOR_ISSUE", replacement_query: "Nintendo Switch Joy-Con (L)", ...over,
});

beforeEach(() => {
  for (const f of [...Object.values(pp), ...Object.values(ai), ...Object.values(c3), ...Object.values(neg)]) f.mockClear();
});

describe("paying", () => {
  it("a test-card payment holds the full price and starts the ship-by clock", async () => {
    const deal = (await getDeal(await heldDeal()))!;
    expect(pp.createTestCardHold).toHaveBeenCalledWith(deal.id, deal.title, 23_000);
    expect(deal.status).toBe("HELD");
    expect(deal.paypal.authorizationId).toBe("AUTH-T");
    expect(deal.shipTo?.line).toBe("1 Main Street, San Jose, CA 95131");
    expect(deal.clock?.heldAt).toBeTruthy();
    expect(pp.captureHold).not.toHaveBeenCalled();
  });

  it("a deal can only be paid once", async () => {
    const id = await heldDeal();
    await expect(flows.fundWithTestCard(id, becomeBuyer)).rejects.toMatchObject({ status: 409 });
    expect(pp.createTestCardHold).toHaveBeenCalledTimes(1);
  });

  it("a backed offer holds the offer, not the asking price, and hands it to the agents", async () => {
    const id = await newDeal({ floorCents: 19_000 });
    await flows.fundWithTestCard(id, becomeBuyer, 21_540);
    expect(pp.createTestCardHold).toHaveBeenCalledWith(id, expect.any(String), 21_500);
    expect((await getDeal(id))!.status).toBe("NEGOTIATING");
    expect(neg.runNegotiation).toHaveBeenCalledWith(id);
  });

  it("refuses offers the seller didn't ask for, offers at asking, and lowballs, before touching PayPal", async () => {
    await expect(flows.fundWithTestCard(await newDeal(), becomeBuyer, 20_000)).rejects.toMatchObject({ status: 400 });
    await expect(flows.fundWithTestCard(await newDeal({ floorCents: 19_000 }), becomeBuyer, 23_000)).rejects.toMatchObject({ status: 400 });
    await expect(flows.fundWithTestCard(await newDeal({ floorCents: 19_000 }), becomeBuyer, 6_000)).rejects.toMatchObject({ status: 400 });
    expect(pp.createTestCardHold).not.toHaveBeenCalled();
  });
});

describe("shipping", () => {
  it("a label that matches the PayPal address ships, with the carrier and tracking read from it", async () => {
    const deal = (await getDeal(await shippedDeal()))!;
    expect(deal.status).toBe("SHIPPED");
    expect(deal.shipment).toMatchObject({ carrier: "UPS", trackingNumber: "1Z999AA1", labelCheck: { match: true } });
  });

  it("a label addressed somewhere else is stopped and the deal stays on hold", async () => {
    const id = await heldDeal();
    ai.readLabel.mockResolvedValueOnce({ ...LABEL, street: "77 Reship Lane", postal_code: "10001" });
    const r = await flows.ship(id, { label: "data:image/png;base64,AAAA", carrier: "", trackingNumber: "" });
    expect(r.blocked).toBe(true);
    expect((await getDeal(id))!.status).toBe("HELD");
  });

  it("needs a tracking number when there's no label photo", async () => {
    await expect(flows.ship(await heldDeal(), { carrier: "UPS", trackingNumber: "" })).rejects.toMatchObject({ status: 400 });
  });

  it("can't ship before the buyer pays", async () => {
    await expect(flows.ship(await newDeal(), { carrier: "UPS", trackingNumber: "1Z" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("settling", () => {
  it("confirming delivery captures the full price, attaches tracking and pays the seller net of fees", async () => {
    const id = await shippedDeal();
    const deal = await flows.confirmDelivery(id);
    expect(pp.captureHold).toHaveBeenCalledWith("AUTH-T", 23_000, `HS-${id}`, expect.any(String));
    expect(pp.addTracking).toHaveBeenCalledWith("ORDER-T", "CAP-T", "1Z999AA1", "UPS");
    expect(pp.payoutSeller).toHaveBeenCalledWith(id, { type: "EMAIL", email: "seller@example.com" }, 22_900, expect.any(String), 0);
    expect(deal.status).toBe("SETTLED");
  });

  it("confirming twice never pays twice", async () => {
    const id = await shippedDeal();
    await flows.confirmDelivery(id);
    await expect(flows.confirmDelivery(id)).rejects.toMatchObject({ status: 409 });
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
    expect(pp.payoutSeller).toHaveBeenCalledTimes(1);
  });

  it("a failed tracking upload doesn't stop the seller's payout", async () => {
    const id = await shippedDeal();
    pp.addTracking.mockRejectedValueOnce(new Error("PayPal down"));
    expect((await flows.confirmDelivery(id)).status).toBe("SETTLED");
    expect(pp.payoutSeller).toHaveBeenCalledTimes(1);
  });
});

describe("damage claims", () => {
  it("prices the refund from real single-part listings, not whole consoles", async () => {
    const id = await shippedDeal();
    ai.reviewClaim.mockResolvedValueOnce(damage());
    c3.searchComps.mockResolvedValueOnce([
      { id: "1", title: "Nintendo Switch Joy-Con (L) Neon Blue", priceCents: 4_999 },
      { id: "2", title: "Joy-Con (L) Gray", priceCents: 4_899 },
      { id: "3", title: "Nintendo Switch OLED with Joy-Con", priceCents: 34_999 },
    ]);
    const deal = await flows.openClaim(id, { note: "Cracked on arrival", photo: "data:image/png;base64,AAAA" });
    expect(deal.status).toBe("CLAIM_OPEN");
    expect(deal.claim).toMatchObject({ partPriceCents: 4_949, refundCents: 4_949, captureCents: 18_051 });
    expect(pp.captureHold).not.toHaveBeenCalled();
  });

  it("caps the refund even when the part is expensive", async () => {
    const id = await shippedDeal();
    ai.reviewClaim.mockResolvedValueOnce(damage({ damaged_part: "screen", replacement_query: "Switch OLED screen" }));
    c3.searchComps.mockResolvedValueOnce([{ id: "1", title: "Switch OLED screen assembly", priceCents: 15_000 }]);
    const deal = await flows.openClaim(id, { note: "", photo: "data:," });
    expect(deal.claim?.refundCents).toBe(8_050); // 35% of $230
  });

  it("a photo of something else gets no refund", async () => {
    const id = await shippedDeal();
    ai.reviewClaim.mockResolvedValueOnce(damage({ photo_shows_item: false, verdict: "NOT_AS_DESCRIBED" }));
    const deal = await flows.openClaim(id, { note: "", photo: "data:," });
    expect(deal.claim).toMatchObject({ verdict: "MATCHES_LISTING", refundCents: 0, captureCents: 23_000 });
  });

  it("settles for the reduced amount only once both sides accept", async () => {
    const id = await shippedDeal();
    ai.reviewClaim.mockResolvedValueOnce(damage());
    c3.searchComps.mockResolvedValueOnce([{ id: "1", title: "Joy-Con (L)", priceCents: 5_000 }]);
    await flows.openClaim(id, { note: "", photo: "data:," });
    expect((await flows.respondToClaim(id, "buyer", true)).status).toBe("CLAIM_OPEN");
    expect(pp.captureHold).not.toHaveBeenCalled();
    expect((await flows.respondToClaim(id, "seller", true)).status).toBe("SETTLED");
    expect(pp.captureHold).toHaveBeenCalledWith("AUTH-T", 18_000, expect.any(String), expect.any(String));
  });

  it("a decline moves no money and remembers who declined first", async () => {
    const id = await shippedDeal();
    ai.reviewClaim.mockResolvedValueOnce(damage());
    await flows.openClaim(id, { note: "", photo: "data:," });
    await flows.respondToClaim(id, "seller", false);
    const deal = await flows.respondToClaim(id, "buyer", false);
    expect(deal.claim?.declinedBy).toBe("seller");
    expect(pp.captureHold).not.toHaveBeenCalled();
  });
});

describe("cancelling", () => {
  it("voids the whole hold before shipping", async () => {
    const deal = await flows.cancel(await heldDeal(), "seller");
    expect(pp.voidHold).toHaveBeenCalledWith("AUTH-T");
    expect(deal.status).toBe("RELEASED");
  });

  it("an unpaid deal cancels without calling PayPal", async () => {
    expect((await flows.cancel(await newDeal(), "seller")).status).toBe("RELEASED");
    expect(pp.voidHold).not.toHaveBeenCalled();
  });

  it("can't cancel once the item has shipped", async () => {
    await expect(flows.cancel(await shippedDeal(), "buyer")).rejects.toMatchObject({ status: 409 });
    expect(pp.voidHold).not.toHaveBeenCalled();
  });
});

describe("meeting in person", () => {
  const meetDeal = () => heldDeal({ handoff: "meet" });
  const showCode = async (id: string) => {
    const r = await flows.startHandover(id);
    if (!("code" in r)) throw new Error("expected a handover code");
    return r;
  };

  it("the buyer's handover code captures the full price and pays the seller, with no shipping", async () => {
    const id = await meetDeal();
    const { code, token, expiresAt } = await showCode(id);
    expect(code).toMatch(/^\d{6}$/);
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(flows.HANDOVER_MS);
    const deal = await flows.confirmHandover(id, { code });
    expect(deal.status).toBe("SETTLED");
    expect(pp.captureHold).toHaveBeenCalledWith("AUTH-T", 23_000, `HS-${id}`, expect.stringContaining("in person"));
    expect(pp.payoutSeller).toHaveBeenCalledWith(id, { type: "EMAIL", email: "seller@example.com" }, 22_900, expect.any(String), 0);
    expect(pp.addTracking).not.toHaveBeenCalled();
    expect(deal.meetup).toBeUndefined();
  });

  it("the scanned QR token works the same way", async () => {
    const id = await meetDeal();
    const { token } = await showCode(id);
    expect((await flows.confirmHandover(id, { token })).status).toBe("SETTLED");
  });

  it("a code works once", async () => {
    const id = await meetDeal();
    const { code } = await showCode(id);
    await flows.confirmHandover(id, { code });
    await expect(flows.confirmHandover(id, { code })).rejects.toMatchObject({ status: 409 });
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
  });

  it("wrong codes are counted, and after 5 even the right code is refused until the seller shows a new one", async () => {
    const id = await meetDeal();
    const { code } = await showCode(id);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < flows.HANDOVER_TRIES; i++) await expect(flows.confirmHandover(id, { code: wrong })).rejects.toMatchObject({ status: 400 });
    expect((await getDeal(id))!.meetup!.attempts).toBe(flows.HANDOVER_TRIES);
    await expect(flows.confirmHandover(id, { code })).rejects.toMatchObject({ status: 429 });
    const fresh = await showCode(id);
    expect((await flows.confirmHandover(id, { code: fresh.code })).status).toBe("SETTLED");
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
  });

  it("a new code replaces the old one", async () => {
    const id = await meetDeal();
    const first = await showCode(id);
    const second = await showCode(id);
    if (first.code !== second.code) await expect(flows.confirmHandover(id, { code: first.code })).rejects.toMatchObject({ status: 400 });
    await expect(flows.confirmHandover(id, { token: first.token })).rejects.toMatchObject({ status: 400 });
    expect((await flows.confirmHandover(id, { token: second.token })).status).toBe("SETTLED");
  });

  it("an expired code is refused and moves no money", async () => {
    const id = await meetDeal();
    const { code } = await showCode(id);
    const deal = (await getDeal(id))!;
    deal.meetup!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await saveDeal(deal);
    await expect(flows.confirmHandover(id, { code })).rejects.toMatchObject({ status: 409 });
    expect(pp.captureHold).not.toHaveBeenCalled();
  });

  it("codes only exist for paid, in-person deals", async () => {
    await expect(flows.startHandover(await heldDeal())).rejects.toMatchObject({ status: 400 });
    await expect(flows.startHandover(await newDeal({ handoff: "meet" }))).rejects.toMatchObject({ status: 409 });
    await expect(flows.confirmHandover(await meetDeal(), { code: "123456" })).rejects.toMatchObject({ status: 409 });
  });

  it("only hashes of the code are stored", async () => {
    const id = await meetDeal();
    const { code, token } = await showCode(id);
    const stored = JSON.stringify((await getDeal(id))!.meetup);
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(token);
  });

  it("an in-person deal can't be shipped around the handover code", async () => {
    await expect(flows.ship(await meetDeal(), { carrier: "UPS", trackingNumber: "1Z" })).rejects.toMatchObject({ status: 400 });
  });

  it("if the payout fails after the capture, the next step finishes it without capturing twice", async () => {
    const id = await meetDeal();
    const { code } = await showCode(id);
    pp.payoutSeller.mockRejectedValueOnce(new Error("PayPal down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    // The buyer's confirmation succeeds: the money is captured and the payout is queued.
    await flows.confirmHandover(id, { code });
    const stuck = (await getDeal(id))!;
    expect(stuck).toMatchObject({ status: "HELD", paypal: { captureId: "CAP-T", payoutAttempts: 1 } });
    // Captured money can't be voided by a deadline, or by walking away; only the payout retry is left.
    const { deadlinesFor } = await import("@/lib/deadlines");
    expect(deadlinesFor(stuck).map((d) => d.kind)).toEqual(["PAYOUT"]);
    await expect(flows.cancel(id, "buyer")).rejects.toMatchObject({ status: 409 });
    // Once the retry time comes, the seller's next tap (or the timer) finishes the payout.
    await saveDeal({ ...(await getDeal(id))!, paypal: { ...stuck.paypal, payoutRetryAt: new Date(Date.now() - 1000).toISOString() } });
    expect(await flows.startHandover(id)).toEqual({ settled: true });
    expect((await getDeal(id))!.status).toBe("SETTLED");
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
    expect(pp.payoutSeller).toHaveBeenCalledTimes(2);
  });

  it("walking away voids the whole hold", async () => {
    const id = await meetDeal();
    await flows.startHandover(id);
    const deal = await flows.cancel(id, "buyer");
    expect(deal.status).toBe("RELEASED");
    expect(deal.meetup).toBeUndefined();
    expect(pp.voidHold).toHaveBeenCalledWith("AUTH-T");
  });
});


describe("sellers signed in with PayPal", () => {
  const SELLER = { payerId: "SELLERPAYER1", name: "Sam Seller", email: "sam@example.com", verified: true };

  it("are paid by payer id, into their own PayPal account", async () => {
    const id = await heldDeal({ seller: SELLER, sellerEmail: "" });
    ai.readLabel.mockResolvedValueOnce(LABEL);
    await flows.ship(id, { label: "data:image/png;base64,AAAA", carrier: "", trackingNumber: "" });
    await flows.confirmDelivery(id);
    expect(pp.payoutSeller).toHaveBeenCalledWith(id, { type: "PAYER_ID", payerId: "SELLERPAYER1" }, 22_900, expect.any(String), 0);
    expect((await getDeal(id))!.events.at(-1)!.text).toContain("into their own PayPal account");
  });

  it("a buyer who pays by logging in to PayPal is linked to the deal by their payer id", async () => {
    const id = await newDeal({ seller: SELLER, paypal: { orderId: "ORDER-P" } });
    await flows.confirmPayment(id, "ORDER-P", becomeBuyer);
    const deal = (await getDeal(id))!;
    expect(deal.status).toBe("HELD");
    expect(deal.buyer).toMatchObject({ payerId: "BUYERPAYER1", name: "Bo Buyer" });
  });

  it("the seller's own PayPal account can't fund their deal: the hold is voided at once", async () => {
    const id = await newDeal({ seller: { ...SELLER, payerId: "BUYERPAYER1" }, paypal: { orderId: "ORDER-S" } });
    await expect(flows.confirmPayment(id, "ORDER-S", becomeBuyer)).rejects.toThrow(/seller's own PayPal/);
    expect(pp.voidHold).toHaveBeenCalledWith("AUTH-P");
    const deal = (await getDeal(id))!;
    expect(deal.status).toBe("AWAITING_PAYMENT");
    expect(deal.buyer).toBeUndefined();
  });
});

describe("when every AI provider is unavailable", () => {
  it("a seller's label can't be checked: the deal stays held, nothing is shipped or captured", async () => {
    const { AiUnavailable } = await import("@/lib/server/ai");
    const id = await heldDeal();
    ai.readLabel.mockRejectedValueOnce(new AiUnavailable(new Error("402")));
    await expect(flows.ship(id, { label: "data:image/png;base64,AAAA", carrier: "", trackingNumber: "" })).rejects.toBeInstanceOf(AiUnavailable);
    const d = (await getDeal(id))!;
    expect(d.status).toBe("HELD");
    expect(d.shipment).toBeUndefined();
    expect(pp.captureHold).not.toHaveBeenCalled();
  });

  it("a buyer's claim can't be reviewed: the deal stays as it was, no refund or capture", async () => {
    const { AiUnavailable } = await import("@/lib/server/ai");
    const id = await shippedDeal();
    pp.captureHold.mockClear();
    ai.reviewClaim.mockRejectedValueOnce(new AiUnavailable(new Error("429")));
    await expect(flows.openClaim(id, { note: "It arrived cracked.", photo: "data:image/png;base64,AAAA" })).rejects.toBeInstanceOf(AiUnavailable);
    const d = (await getDeal(id))!;
    expect(d.status).toBe("SHIPPED");
    expect(d.claim).toBeUndefined();
    expect(pp.captureHold).not.toHaveBeenCalled();
  });
});
