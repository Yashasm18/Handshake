import "server-only";
import type { Deal } from "../types";
import { usd } from "../types";
import { log, saveDeal, withDeal } from "./deals";
import * as pp from "./paypal";

// The buyer's receipt: once PayPal has captured a deal's payment, Handshake issues a PayPal invoice for
// it and records it as paid. It isn't a bare total. It's the deal's proof: the item and the condition
// the seller promised, the asking and the agreed price when agents negotiated, any damage refund as a
// line of its own, how it was handed over, and the PayPal capture it settles.
//
// A receipt never moves money and can never hold one up. It runs only after the capture, outside the
// money steps, in the background. Every PayPal call carries an idempotency key and every step is saved,
// so a retry finishes the same invoice instead of making a second one. If PayPal is busy, it tries again
// later, the next time someone opens the deal.

// On unless switched off (PAYPAL_RECEIPTS=false), and only where Handshake has a PayPal app.
export const receiptsEnabled = () => Boolean(process.env.PAYPAL_CLIENT_ID) && process.env.PAYPAL_RECEIPTS !== "false";

// The receipt's number. One per deal, so PayPal itself refuses a duplicate.
export const receiptNumber = (deal: Deal) => `HS-${deal.id}`.slice(0, 127);

// 1, 2, 4 … minutes, capped at an hour: a receipt is useful soon, but never urgent.
export const receiptBackoff = (attempts: number) => Math.min(60, 2 ** (attempts - 1)) * 60_000;
// After PayPal refuses permission: long enough for any access token issued before Invoicing was enabled to expire.
export const UNAVAILABLE_RETRY_MS = 10 * 60 * 60_000;

// Due when money was captured, no receipt is finished, and any wait after a failure is over.
export function receiptDue(deal: Deal, now = Date.now()) {
  const r = deal.paypal.receipt;
  if (!receiptsEnabled() || !deal.paypal.captureId || r?.status === "paid") return false;
  return !r?.retryAt || Date.parse(r.retryAt) <= now;
}

const day = (now: number) => new Date(now).toISOString().slice(0, 10);
// PayPal invoices name a person by given name and surname (a single full_name is silently dropped).
const personName = (full: string) => {
  const [given, ...rest] = full.trim().split(/\s+/);
  return { given_name: given.slice(0, 140), ...(rest.length ? { surname: rest.join(" ").slice(0, 140) } : {}) };
};
const money = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });

// The invoice itself, built from the deal alone. Amounts come from what PayPal captured, never from a model.
export function receiptInvoice(deal: Deal, now = Date.now()) {
  const p = deal.paypal;
  const captured = p.capturedCents ?? deal.priceCents;
  const refund = Math.max(0, deal.priceCents - captured);
  const n = deal.negotiation;
  const negotiated = n?.status === "AGREED" && n.agreedCents != null && n.askingCents > n.agreedCents;

  const promises = deal.checklist.filter(Boolean).slice(0, 6);
  const description = [
    deal.condition && `Condition: ${deal.condition}`,
    promises.length ? `Promised by ${deal.sellerName}: ${promises.join("; ")}` : "",
  ].filter(Boolean).join(". ");

  const how = deal.handoff === "meet"
    ? "Handed over in person: the buyer checked the item, then scanned the seller's code."
    : deal.shipment
      ? `Shipped with ${deal.shipment.carrier}, tracking ${deal.shipment.trackingNumber}.`
      : "";
  const note = [
    "Protected by Handshake. PayPal held this payment and released it only after the item arrived.",
    negotiated ? `Price agreed by AI agents: asking ${usd(n!.askingCents)}, agreed ${usd(n!.agreedCents!)}.` : "",
    refund && deal.claim ? `Damage review: ${usd(refund)} went back to the buyer for ${deal.claim.damagedPart}.` : "",
    how,
    p.captureId ? `PayPal capture ${p.captureId}.` : "",
  ].filter(Boolean).join("\n");

  const buyerEmail = deal.buyer?.email ?? p.buyerEmail;
  const buyerName = deal.buyer?.name || deal.shipTo?.name;
  const recipient = buyerEmail || buyerName
    ? [{ billing_info: { ...(buyerName ? { name: personName(buyerName) } : {}), ...(buyerEmail ? { email_address: buyerEmail } : {}) } }]
    : undefined;

  return {
    detail: {
      invoice_number: receiptNumber(deal),
      reference: `Handshake deal ${deal.id}`.slice(0, 120),
      invoice_date: day(now),
      currency_code: "USD",
      note: note.slice(0, 4000),
      memo: `Handshake deal ${deal.id}, seller ${deal.sellerName}`.slice(0, 500),
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: { business_name: "Handshake" },
    ...(recipient ? { primary_recipients: recipient } : {}),
    items: [
      {
        name: deal.title.slice(0, 200),
        ...(description ? { description: description.slice(0, 1000) } : {}),
        quantity: "1",
        unit_amount: money(deal.priceCents),
        unit_of_measure: "QUANTITY",
      },
    ],
    configuration: { allow_tip: false, tax_calculated_after_discount: true, tax_inclusive: false },
    // A damage refund shows as its own line, so the receipt's total is exactly what PayPal captured.
    ...(refund ? { amount: { breakdown: { discount: { invoice_discount: { amount: money(refund) } } } } } : {}),
  };
}

// Issues the receipt, step by step, inside the deal's lock. Never throws: a failure only schedules a retry.
export async function issueReceipt(deal: Deal, now = Date.now()): Promise<void> {
  if (!receiptDue(deal, now)) return;
  const p = deal.paypal;
  const r = (p.receipt ??= {});
  try {
    if (!r.invoiceId) {
      const number = receiptNumber(deal);
      let invoice: pp.Invoice | undefined;
      try {
        invoice = await pp.createInvoice(receiptInvoice(deal, now), `receipt-${deal.id}`);
      } catch (e) {
        // Created on an earlier try whose answer never arrived: PayPal refuses the number again, so find it.
        if (!(e instanceof pp.PayPalError && /DUPLICATE/i.test(e.issue ?? ""))) throw e;
        invoice = (await pp.findInvoice(number)).items?.[0];
        if (!invoice) throw e;
      }
      r.invoiceId = invoice.id;
      r.number = number;
      r.status = "created";
      await saveDeal(deal); // an invoice exists now: record it before anything else can fail
    }
    if (r.status === "created") {
      await pp.sendInvoice(r.invoiceId);
      r.status = "sent";
      await saveDeal(deal);
    }
    const captured = p.capturedCents ?? deal.priceCents;
    await pp.recordInvoicePayment(r.invoiceId, captured, day(now), `Paid through PayPal and held by Handshake until it arrived. Capture ${p.captureId}.`).catch(async (e) => {
      // Already recorded on an earlier try: PayPal says so, and the invoice reads paid. That's success.
      const status = (await pp.getInvoice(r.invoiceId!).catch(() => null))?.status ?? "";
      if (!/PAID/.test(status)) throw e;
    });
    const invoice = await pp.getInvoice(r.invoiceId).catch(() => null);
    r.url = invoice?.detail?.metadata?.recipient_view_url ?? r.url;
    r.status = "paid";
    r.retryAt = undefined;
    r.unavailable = undefined;
    log(deal, "paypal", `Issued the buyer's receipt: a PayPal invoice for ${usd(captured)}, marked paid.`, r.invoiceId);
  } catch (e) {
    // PayPal says this app may not invoice. Either Invoicing isn't enabled on it, or it was enabled after
    // PayPal issued the access token in use (a token keeps the permissions it was issued with, for up to
    // 9 hours). The receipt card is hidden and one quiet retry is made after the token has refreshed.
    if (e instanceof pp.PayPalError && (e.status === 401 || e.status === 403)) {
      r.unavailable = true;
      r.attempts = (r.attempts ?? 0) + 1;
      r.retryAt = new Date(now + UNAVAILABLE_RETRY_MS).toISOString();
      console.error("receipt unavailable", deal.id, e.status, e.issue, e.debugId);
      return;
    }
    r.attempts = (r.attempts ?? 0) + 1;
    r.retryAt = new Date(now + receiptBackoff(r.attempts)).toISOString();
    console.error("receipt", deal.id, r.attempts, e instanceof pp.PayPalError ? `${e.status} ${e.issue} ${e.debugId}` : (e as Error).message);
  }
}

// Runs the receipt in the background after a request, one at a time per deal on this server, so the
// person who tapped a button never waits for it and polling doesn't pile up runs.
const g = globalThis as unknown as { __hsReceiptRuns?: Set<string> };
const running = (g.__hsReceiptRuns ??= new Set());
export function issueReceiptSoon(deal: Deal) {
  if (!receiptDue(deal) || running.has(deal.id)) return;
  running.add(deal.id);
  withDeal(deal.id, (d) => issueReceipt(d))
    .catch((e) => console.error("receipt", deal.id, (e as Error).message))
    .finally(() => running.delete(deal.id));
}
