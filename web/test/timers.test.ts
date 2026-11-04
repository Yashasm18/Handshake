import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAY, countdown, deadlinesFor } from "@/lib/deadlines";
import type { Deal } from "@/lib/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-timers-"));

// PayPal is mocked: these tests are about when and how often money moves, not the HTTP calls.
const pp = vi.hoisted(() => ({
  voidHold: vi.fn(async () => ({})),
  reauthorizeHold: vi.fn(async () => ({ id: "AUTH-NEW", status: "CREATED" })),
  captureHold: vi.fn(async (_a: string, cents: number) => ({
    id: "CAP-1",
    status: "COMPLETED",
    seller_receivable_breakdown: { gross_amount: { value: (cents / 100).toFixed(2) }, paypal_fee: { value: "1.00" }, net_amount: { value: (cents / 100 - 1).toFixed(2) } },
  })),
  addTracking: vi.fn(async () => ({})),
  payoutSeller: vi.fn(async () => ({ batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } })),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));

const { runTimer, dueTimers } = await import("@/lib/server/timers");
const { saveDeal, getDeal } = await import("@/lib/server/deals");
const { PayPalError } = await import("@/lib/server/paypal");
const flows = await import("@/lib/server/flows");

const T0 = Date.parse("2026-11-01T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const VERIFIED = { carrier: "UPS", trackingNumber: "1Z", labelCheck: { match: true, read: "", reason: "" } };
let n = 0;
function deal(over: Partial<Deal>): Deal {
  return {
    id: `deal-${++n}-xxxxxxxxxxxxxx`, createdAt: iso(T0), updatedAt: iso(T0), title: "Switch OLED", priceCents: 23_000, condition: "Used",
    checklist: [], sellerName: "Sam", sellerEmail: "s@example.com", scan: null, status: "HELD", demo: false,
    paypal: { orderId: "ORDER-1", authorizationId: "AUTH-1" }, events: [], clock: { heldAt: iso(T0), authorizedAt: iso(T0) }, ...over,
  };
}

beforeEach(() => Object.values(pp).forEach((f) => f.mockClear()));

describe("deadlines", () => {
  it("gives a paid deal 3 days to ship", () => {
    expect(deadlinesFor(deal({}))).toEqual([expect.objectContaining({ kind: "SHIP_BY", at: T0 + 3 * DAY, who: "seller" })]);
  });
  it("after shipping: renew the hold on day 3 and release 7 days after shipping", () => {
    const d = deal({ status: "SHIPPED", shipment: VERIFIED, clock: { heldAt: iso(T0), authorizedAt: iso(T0), shippedAt: iso(T0 + DAY) } });
    expect(deadlinesFor(d).map((x) => [x.kind, x.at])).toEqual([["REAUTHORIZE", T0 + 3 * DAY], ["AUTO_RELEASE", T0 + 8 * DAY]]);
  });
  it("never auto-releases a shipment the seller only typed in", () => {
    const typed = { carrier: "UPS", trackingNumber: "1Z", labelCheck: null };
    const d = deal({ status: "SHIPPED", shipment: typed, clock: { authorizedAt: iso(T0), shippedAt: iso(T0) } });
    expect(deadlinesFor(d).map((x) => x.kind)).toEqual(["REAUTHORIZE"]);
    d.shipment = { ...typed, labelCheck: { match: false, read: "", reason: "" } };
    expect(deadlinesFor(d).map((x) => x.kind)).toEqual(["REAUTHORIZE"]);
  });
  it("doesn't renew a hold that's already captured", () => {
    const d = deal({ status: "SHIPPED", shipment: VERIFIED, paypal: { orderId: "O", authorizationId: "A", captureId: "CAP" }, clock: { authorizedAt: iso(T0), shippedAt: iso(T0) } });
    expect(deadlinesFor(d).map((x) => x.kind)).toEqual(["AUTO_RELEASE"]);
  });
  it("a declined claim never auto-settles", () => {
    const d = deal({ status: "CLAIM_OPEN", clock: { authorizedAt: iso(T0), reauthorizedAt: iso(T0), claimAt: iso(T0) } });
    expect(deadlinesFor(d).map((x) => x.kind)).toEqual(["CLAIM_SETTLE"]);
    d.claim = { declinedBy: "seller" } as Deal["claim"];
    expect(deadlinesFor(d)).toEqual([]);
  });
  it("settled, released and unpaid deals have no deadlines", () => {
    for (const status of ["SETTLED", "RELEASED", "AWAITING_PAYMENT"] as const) expect(deadlinesFor(deal({ status }))).toEqual([]);
  });
  it("scales for demos without changing the order", () => {
    expect(deadlinesFor(deal({}), 1 / 1440)[0].at).toBe(T0 + 3 * 60_000);
  });
  it("formats countdowns", () => {
    expect([countdown(2 * DAY + 14 * 3600e3), countdown(3 * 3600e3 + 5 * 60e3), countdown(45e3), countdown(-1)]).toEqual(["2d 14h", "3h 05m", "45s", "now"]);
  });
});

describe("timer actions", () => {
  it("voids the hold when the seller never ships, exactly once", async () => {
    const d = await saveDeal(deal({}));
    const at = T0 + 3 * DAY + 1;
    expect((await runTimer(d.id, "SHIP_BY", at)).outcome).toBe("done");
    expect((await runTimer(d.id, "SHIP_BY", at)).outcome).toBe("not-due");
    expect(pp.voidHold).toHaveBeenCalledTimes(1);
    expect((await getDeal(d.id))!.status).toBe("RELEASED");
  });

  it("an in-person deal has a meet-by deadline instead, and voids the hold once if nobody meets", async () => {
    const d = await saveDeal(deal({ handoff: "meet" }));
    expect(deadlinesFor(d).map((x) => [x.kind, x.at, x.who])).toEqual([["MEET_BY", T0 + 3 * DAY, "both"]]);
    const at = T0 + 3 * DAY + 1;
    expect((await runTimer(d.id, "SHIP_BY", at)).outcome).toBe("not-due");
    expect((await runTimer(d.id, "MEET_BY", at)).outcome).toBe("done");
    expect((await runTimer(d.id, "MEET_BY", at)).outcome).toBe("not-due");
    expect(pp.voidHold).toHaveBeenCalledTimes(1);
    expect((await getDeal(d.id))!.status).toBe("RELEASED");
  });

  it("does nothing before the deadline", async () => {
    const d = await saveDeal(deal({}));
    expect((await runTimer(d.id, "SHIP_BY", T0 + DAY)).outcome).toBe("not-due");
    expect(pp.voidHold).not.toHaveBeenCalled();
  });

  it("doesn't void a deal that shipped in time", async () => {
    const d = await saveDeal(deal({ status: "SHIPPED", clock: { heldAt: iso(T0), authorizedAt: iso(T0), shippedAt: iso(T0 + DAY) } }));
    expect((await runTimer(d.id, "SHIP_BY", T0 + 4 * DAY)).outcome).toBe("not-due");
    expect(pp.voidHold).not.toHaveBeenCalled();
  });

  it("concurrent runs of the same deadline move money once", async () => {
    const d = await saveDeal(deal({ status: "SHIPPED", shipment: VERIFIED, clock: { authorizedAt: iso(T0), reauthorizedAt: iso(T0), shippedAt: iso(T0) } }));
    const at = T0 + 7 * DAY + 1;
    const results = await Promise.all([runTimer(d.id, "AUTO_RELEASE", at), runTimer(d.id, "AUTO_RELEASE", at), runTimer(d.id, "AUTO_RELEASE", at)]);
    expect(results.filter((r) => r.outcome === "done")).toHaveLength(1);
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
    expect((await getDeal(d.id))!.status).toBe("SETTLED");
  });

  it("renews the hold and stores the new authorization", async () => {
    const d = await saveDeal(deal({ status: "SHIPPED", shipment: VERIFIED, clock: { authorizedAt: iso(T0), shippedAt: iso(T0) } }));
    expect((await runTimer(d.id, "REAUTHORIZE", T0 + 3 * DAY + 1)).outcome).toBe("done");
    const after = (await getDeal(d.id))!;
    expect(after.paypal.authorizationId).toBe("AUTH-NEW");
    expect(deadlinesFor(after).map((x) => x.kind)).toEqual(["AUTO_RELEASE"]);
  });

  it("reschedules a renewal PayPal says is too early", async () => {
    pp.reauthorizeHold.mockRejectedValueOnce(new PayPalError("Too soon", 422, "REAUTHORIZATION_TOO_SOON"));
    const d = await saveDeal(deal({ status: "SHIPPED", clock: { authorizedAt: iso(T0), shippedAt: iso(T0) } }));
    expect((await runTimer(d.id, "REAUTHORIZE", T0 + 3 * DAY + 1)).outcome).toBe("rescheduled");
    expect(deadlinesFor((await getDeal(d.id))!)[0].at).toBeGreaterThan(T0 + 3 * DAY + 1);
  });

  it("lets other PayPal failures fail the run, so the workflow retries it", async () => {
    pp.voidHold.mockRejectedValueOnce(new PayPalError("Server error", 500));
    const d = await saveDeal(deal({}));
    await expect(runTimer(d.id, "SHIP_BY", T0 + 4 * DAY)).rejects.toThrow("Server error");
    expect((await getDeal(d.id))!.status).toBe("HELD");
  });

  it("a payout failure resumes without capturing twice", async () => {
    pp.payoutSeller.mockRejectedValueOnce(new PayPalError("Server error", 500));
    const d = await saveDeal(deal({ status: "SHIPPED", shipment: VERIFIED, clock: { authorizedAt: iso(T0), reauthorizedAt: iso(T0), shippedAt: iso(T0) } }));
    await expect(runTimer(d.id, "AUTO_RELEASE", T0 + 8 * DAY)).rejects.toThrow();
    const mid = (await getDeal(d.id))!;
    expect(mid.paypal.captureId).toBe("CAP-1"); // the capture is recorded even though the run failed
    expect(mid.status).toBe("SHIPPED");
    expect((await runTimer(d.id, "AUTO_RELEASE", T0 + 8 * DAY)).outcome).toBe("done");
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
    expect(pp.payoutSeller).toHaveBeenCalledTimes(2);
    const after = (await getDeal(d.id))!;
    expect(after.status).toBe("SETTLED");
    expect(after.events.filter((e) => e.text.includes("released automatically"))).toHaveLength(1);
    expect(after.events.filter((e) => e.text.startsWith("Captured"))).toHaveLength(1);
  });

  it("after a capture, no claim or cancel can change the outcome", async () => {
    pp.payoutSeller.mockRejectedValueOnce(new PayPalError("Server error", 500));
    const d = await saveDeal(deal({ status: "SHIPPED", shipment: VERIFIED, clock: { authorizedAt: iso(T0), reauthorizedAt: iso(T0), shippedAt: iso(T0) } }));
    await expect(runTimer(d.id, "AUTO_RELEASE", T0 + 8 * DAY)).rejects.toThrow(); // captured, payout pending
    await expect(flows.openClaim(d.id, { note: "broken", photo: "data:image/png;base64,AA" })).rejects.toThrow(/already being settled/);
    await expect(flows.settle((await getDeal(d.id))!, 5_000, "different amount")).rejects.toThrow(/different amount/);
    expect(pp.captureHold).toHaveBeenCalledTimes(1);
    // The original release can still finish.
    await flows.confirmDelivery(d.id);
    expect((await getDeal(d.id))!.status).toBe("SETTLED");
  });

  it("lists only what is due", async () => {
    const late = await saveDeal(deal({ clock: { heldAt: iso(Date.now() - 4 * DAY), authorizedAt: iso(Date.now() - 4 * DAY) } }));
    const fresh = await saveDeal(deal({ clock: { heldAt: iso(Date.now()), authorizedAt: iso(Date.now()) } }));
    const due = (await dueTimers()).map((t) => t.dealId);
    expect(due).toContain(late.id);
    expect(due).not.toContain(fresh.id);
  });
});
