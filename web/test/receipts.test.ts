import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-receipts-"));

// The buyer's PayPal receipt: an invoice issued after the capture and marked paid. What's under test is
// that it shows exactly what PayPal captured, that a retry finishes the same invoice instead of making a
// second one, and that no failure can ever reach the money steps.
const pp = vi.hoisted(() => ({
  createInvoice: vi.fn(async (_body: unknown, _key: string) => ({ id: "INV2-AAAA", status: "DRAFT" })),
  sendInvoice: vi.fn(async (_id: string) => ({})),
  recordInvoicePayment: vi.fn(async (_id: string, _cents: number, _date: string, _note: string) => ({ payment_id: "EXTR-1" })),
  getInvoice: vi.fn(async (id: string) => ({ id, status: "PAID", detail: { metadata: { recipient_view_url: `https://www.sandbox.paypal.com/invoice/p/#${id}` } } })),
  findInvoice: vi.fn(async (_n: string) => ({ items: [{ id: "INV2-FOUND", status: "DRAFT" }] })),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));

const { PayPalError } = await import("@/lib/server/paypal");
const receipts = await import("@/lib/server/receipts");
const { saveDeal, getDeal } = await import("@/lib/server/deals");
const { publicDeal } = await import("@/lib/server/auth");

const NOW = Date.parse("2026-11-08T12:00:00Z");
let n = 0;
function captured(over: Partial<Deal> = {}): Deal {
  return {
    id: `rcpt-${++n}-xxxxxxxxxxxxxx`, createdAt: "", updatedAt: "", title: "Nintendo Switch OLED (white)", priceCents: 20_000, condition: "Used, small scuff on the back",
    checklist: ["Screen is free of scratches", "Both Joy-Cons, dock and charger included"], sellerName: "Sam", sellerEmail: "seller@example.com", scan: null,
    status: "SETTLED", demo: false, handoff: "ship",
    shipTo: { name: "Maya Chen", line: "2211 N First St, San Jose, CA 95131" },
    shipment: { carrier: "USPS", trackingNumber: "EZ4000000004", labelCheck: null },
    negotiation: { status: "AGREED", askingCents: 23_000, agreedCents: 20_000, fair: null, turns: [], startedAt: "" },
    paypal: { orderId: "ORDER-1", authorizationId: "AUTH-1", captureId: "CAP-1", capturedCents: 20_000, buyerEmail: "maya@example.com" },
    events: [],
    ...over,
  };
}

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_RECEIPTS = "true";
  for (const f of Object.values(pp)) f.mockClear();
});

describe("the receipt invoice: proof of the deal, built from what PayPal captured", () => {
  it("bills the agreed price, with the condition promises, the negotiation, the tracking and the capture", () => {
    const inv = receipts.receiptInvoice(captured(), NOW) as Record<string, any>;
    expect(inv.detail.invoice_number).toMatch(/^HS-rcpt-/);
    expect(inv.detail.invoice_date).toBe("2026-11-08");
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0]).toMatchObject({ name: "Nintendo Switch OLED (white)", quantity: "1", unit_amount: { currency_code: "USD", value: "200.00" } });
    expect(inv.items[0].description).toContain("Screen is free of scratches");
    expect(inv.detail.note).toContain("asking $230, agreed $200");
    expect(inv.detail.note).toContain("Shipped with USPS, tracking EZ4000000004");
    expect(inv.detail.note).toContain("PayPal capture CAP-1");
    expect(inv.primary_recipients[0].billing_info).toEqual({ name: { given_name: "Maya", surname: "Chen" }, email_address: "maya@example.com" });
    expect(inv.amount).toBeUndefined(); // nothing refunded: no discount line
  });

  it("shows a damage refund as its own line, so the total is exactly what PayPal captured", () => {
    const deal = captured({
      paypal: { orderId: "O", authorizationId: "A", captureId: "CAP-2", capturedCents: 15_500 },
      claim: { damagedPart: "left Joy-Con" } as Deal["claim"],
    });
    const inv = receipts.receiptInvoice(deal, NOW) as Record<string, any>;
    expect(inv.amount.breakdown.discount.invoice_discount.amount).toEqual({ currency_code: "USD", value: "45.00" });
    expect(Number(inv.items[0].unit_amount.value) - Number(inv.amount.breakdown.discount.invoice_discount.amount.value)).toBe(155);
    expect(inv.detail.note).toContain("$45 went back to the buyer for left Joy-Con");
  });

  it("says how an in-person deal was handed over, and leaves out a negotiation that didn't lower the price", () => {
    const inv = receipts.receiptInvoice(captured({ handoff: "meet", shipment: undefined, negotiation: undefined }), NOW) as Record<string, any>;
    expect(inv.detail.note).toContain("Handed over in person");
    expect(inv.detail.note).not.toContain("agreed by AI agents");
  });

  it("works for a buyer who paid by card and left no email: the receipt names them from the shipping address", () => {
    const deal = captured({ paypal: { orderId: "O", authorizationId: "A", captureId: "CAP-3", capturedCents: 20_000 } });
    const inv = receipts.receiptInvoice(deal, NOW) as Record<string, any>;
    expect(inv.primary_recipients[0].billing_info).toEqual({ name: { given_name: "Maya", surname: "Chen" } });
  });
});

describe("issuing the receipt", () => {
  it("creates, sends and records it as paid, each under its own idempotency key, then shows the link", async () => {
    const deal = captured();
    await saveDeal(deal);
    await receipts.issueReceipt(deal, NOW);
    expect(pp.createInvoice).toHaveBeenCalledWith(expect.any(Object), `receipt-${deal.id}`);
    expect(pp.sendInvoice).toHaveBeenCalledWith("INV2-AAAA");
    expect(pp.recordInvoicePayment).toHaveBeenCalledWith("INV2-AAAA", 20_000, "2026-11-08", expect.stringContaining("CAP-1"));
    expect(deal.paypal.receipt).toMatchObject({ invoiceId: "INV2-AAAA", status: "paid", url: expect.stringContaining("INV2-AAAA") });
    expect(deal.events.at(-1)).toMatchObject({ actor: "paypal", ref: "INV2-AAAA" });
    expect(deal.events.at(-1)!.text).toContain("marked paid");
  });

  it("does nothing before the money is captured, once it's done, or when receipts are switched off", async () => {
    await receipts.issueReceipt(captured({ paypal: { orderId: "O", authorizationId: "A" } }), NOW);
    await receipts.issueReceipt(captured({ paypal: { captureId: "C", receipt: { invoiceId: "X", status: "paid" } } }), NOW);
    process.env.PAYPAL_RECEIPTS = "false";
    await receipts.issueReceipt(captured(), NOW);
    expect(pp.createInvoice).not.toHaveBeenCalled();
  });

  it("never throws: a PayPal failure only schedules a retry, and the retry finishes the same invoice", async () => {
    const deal = captured();
    await saveDeal(deal);
    pp.sendInvoice.mockRejectedValueOnce(new PayPalError("busy", 503, "INTERNAL_SERVICE_ERROR"));
    await expect(receipts.issueReceipt(deal, NOW)).resolves.toBeUndefined();
    expect(deal.paypal.receipt).toMatchObject({ invoiceId: "INV2-AAAA", status: "created", attempts: 1 });
    expect(Date.parse(deal.paypal.receipt!.retryAt!)).toBe(NOW + 60_000);
    // The invoice was saved the moment it existed, so a crash here couldn't lose it.
    expect((await getDeal(deal.id))!.paypal.receipt?.invoiceId).toBe("INV2-AAAA");

    // Before the wait is over, nothing runs; after it, the same invoice is sent: no second one is made.
    await receipts.issueReceipt(deal, NOW + 30_000);
    expect(pp.sendInvoice).toHaveBeenCalledTimes(1);
    await receipts.issueReceipt(deal, NOW + 61_000);
    expect(pp.createInvoice).toHaveBeenCalledTimes(1);
    expect(pp.sendInvoice).toHaveBeenCalledTimes(2);
    expect(deal.paypal.receipt).toMatchObject({ status: "paid", retryAt: undefined });
  });

  it("recovers an invoice PayPal made on an earlier try whose answer never arrived", async () => {
    const deal = captured();
    await saveDeal(deal);
    pp.createInvoice.mockRejectedValueOnce(new PayPalError("Invoice number already exists", 422, "DUPLICATE_INVOICE_NUMBER"));
    await receipts.issueReceipt(deal, NOW);
    expect(pp.findInvoice).toHaveBeenCalledWith(`HS-${deal.id}`);
    expect(deal.paypal.receipt).toMatchObject({ invoiceId: "INV2-FOUND", status: "paid" });
  });

  it("treats a payment PayPal already recorded as done, not as a failure", async () => {
    const deal = captured();
    await saveDeal(deal);
    pp.recordInvoicePayment.mockRejectedValueOnce(new PayPalError("Invoice already paid", 422, "INVOICE_ALREADY_PAID"));
    await receipts.issueReceipt(deal, NOW);
    expect(deal.paypal.receipt?.status).toBe("paid");
  });

  it("hides the card when PayPal refuses permission, and tries once more after the access token has refreshed", async () => {
    const deal = captured();
    await saveDeal(deal);
    pp.createInvoice.mockRejectedValueOnce(new PayPalError("Authorization failed due to insufficient permissions.", 403, "NOT_AUTHORIZED"));
    await expect(receipts.issueReceipt(deal, NOW)).resolves.toBeUndefined();
    expect(deal.paypal.receipt).toMatchObject({ unavailable: true, attempts: 1 });
    // No hammering PayPal while the permission is missing...
    expect(receipts.receiptDue(deal, NOW + 9 * 3_600_000)).toBe(false);
    // ...but once any old token has expired, one more try, and success clears the flag.
    expect(receipts.receiptDue(deal, NOW + receipts.UNAVAILABLE_RETRY_MS)).toBe(true);
    await receipts.issueReceipt(deal, NOW + receipts.UNAVAILABLE_RETRY_MS);
    expect(pp.createInvoice).toHaveBeenCalledTimes(2);
    expect(deal.paypal.receipt).toMatchObject({ status: "paid", unavailable: undefined });
  });

  it("backs off 1, 2, 4 … minutes, up to an hour", () => {
    expect([1, 2, 3, 7, 12].map(receipts.receiptBackoff)).toEqual([60_000, 120_000, 240_000, 3_600_000, 3_600_000]);
  });
});

describe("who sees the receipt", () => {
  it("only the buyer and the seller see the receipt and its link; a stranger with the deal link doesn't", () => {
    const deal = captured({ paypal: { captureId: "CAP-1", receipt: { invoiceId: "INV2-AAAA", status: "paid", url: "https://www.sandbox.paypal.com/invoice/p/#INV2-AAAA" } } });
    expect(publicDeal(deal, { buyer: true, seller: false }).paypal.receipt?.url).toContain("INV2-AAAA");
    expect(publicDeal(deal, { buyer: false, seller: true }).paypal.receipt?.invoiceId).toBe("INV2-AAAA");
    expect(publicDeal(deal, { buyer: false, seller: false }).paypal.receipt).toBeUndefined();
  });
});
