import "server-only";
import { randomUUID } from "node:crypto";

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
// True unless the server points at PayPal's live API. The site tells people to use sandbox accounts then.
export const isSandbox = () => !/^https:\/\/api-m\.paypal\.com/.test(process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com");

// Two PayPal apps: "main" takes payments (orders, holds, captures, sign-in); "payouts" pays sellers.
// They can be the same app. A separate payouts app has its own balance, so money held on the main
// account (PayPal holds incoming payments on new business accounts) can't stop sellers being paid.
// Without PAYPAL_PAYOUT_CLIENT_ID/SECRET, payouts use the main app.
type App = "main" | "payouts";
const credentials = (app: App) =>
  app === "payouts" && process.env.PAYPAL_PAYOUT_CLIENT_ID && process.env.PAYPAL_PAYOUT_CLIENT_SECRET
    ? { id: process.env.PAYPAL_PAYOUT_CLIENT_ID, secret: process.env.PAYPAL_PAYOUT_CLIENT_SECRET }
    : { id: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET };
export const separatePayoutApp = () => credentials("payouts").id !== process.env.PAYPAL_CLIENT_ID;

const cached = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(app: App = "main"): Promise<string> {
  const { id, secret } = credentials(app);
  const hit = cached.get(id ?? "");
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached.set(id ?? "", { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public issue?: string,
    public debugId?: string | null,
  ) {
    super(message);
  }
}

// Every mutating call carries its own idempotency key, so a retry can never
// double-charge (the gap tracked in paypal/agent-toolkit#98).
async function call<T>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string, app: App = "main"): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken(app)}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(method === "POST" ? { "PayPal-Request-Id": requestId ?? randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = json.details?.[0]?.issue ?? json.name;
    throw new PayPalError(json.details?.[0]?.description ?? json.message ?? "PayPal request failed", res.status, issue, res.headers.get("paypal-debug-id"));
  }
  return json as T;
}

const money = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });

type Order = {
  id: string;
  status: string;
  payer?: { payer_id?: string; email_address?: string; name?: { given_name?: string; surname?: string } };
  purchase_units: {
    shipping?: { name?: { full_name?: string }; address?: Address };
    payments?: { authorizations?: { id: string; status: string; amount: { value: string } }[] };
  }[];
};
export type Address = {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_2?: string;
  admin_area_1?: string;
  postal_code?: string;
  country_code?: string;
};

export async function createHoldOrder(dealId: string, title: string, cents: number) {
  return call<Order>("POST", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [{ reference_id: dealId, custom_id: dealId, description: title.slice(0, 120), amount: money(cents) }],
  });
}

// Judge/demo path: a hold funded by PayPal's published sandbox test card, no buyer login.
export async function createTestCardHold(dealId: string, title: string, cents: number) {
  const address = { address_line_1: "2211 N First St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" };
  return call<Order>("POST", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: dealId,
        custom_id: dealId,
        description: title.slice(0, 120),
        amount: money(cents),
        shipping: { name: { full_name: "Maya Chen" }, address },
      },
    ],
    payment_source: {
      card: { number: "4111111111111111", expiry: "2030-12", security_code: "123", name: "Maya Chen", billing_address: address },
    },
  });
}

export const authorizeOrder = (orderId: string) => call<Order>("POST", `/v2/checkout/orders/${orderId}/authorize`, {});
export const getOrder = (orderId: string) => call<Order>("GET", `/v2/checkout/orders/${orderId}`);

export type Capture = {
  id: string;
  status: string;
  seller_receivable_breakdown?: { gross_amount: { value: string }; paypal_fee?: { value: string }; net_amount: { value: string } };
};

// final_capture releases whatever is left on the hold back to the buyer.
// One capture per authorization: the request id makes a retried capture return the original instead of a second one.
export const captureHold = (authorizationId: string, cents: number, invoiceId: string, note: string) =>
  call<Capture>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { amount: money(cents), final_capture: true, invoice_id: invoiceId, note_to_payer: note.slice(0, 255) },
    `capture-${authorizationId}`,
  );

// After PayPal's 3-day honor period, a reauthorization re-reserves the funds and returns a new authorization.
export const reauthorizeHold = (authorizationId: string) =>
  call<{ id: string; status: string; expiration_time?: string }>("POST", `/v2/payments/authorizations/${authorizationId}/reauthorize`, {});

export const voidHold = (authorizationId: string) => call<{ status?: string }>("POST", `/v2/payments/authorizations/${authorizationId}/void`, {});

export const addTracking = (orderId: string, captureId: string, trackingNumber: string, carrier: string) =>
  call("POST", `/v2/checkout/orders/${orderId}/track`, {
    capture_id: captureId,
    tracking_number: trackingNumber,
    carrier,
    notify_payer: false,
  });

// Where a payout goes: the seller's own PayPal account (by payer id, from Sign in with PayPal; the Payouts
// API calls this recipient type PAYPAL_ID), or, for a
// guest demo seller, the sandbox seller account by email.
export type Payee = { type: "PAYER_ID"; payerId: string } | { type: "EMAIL"; email: string };

// `attempt` changes only after PayPal definitely refused a payout (so none was created). PayPal remembers
// a request id's first answer, refusals included, so a retry after, say, a top-up needs a new key; a
// retry after a timeout keeps the same key and batch id, so a payout that did go through isn't repeated.
export async function payoutSeller(dealId: string, payee: Payee, cents: number, note: string, attempt = 0) {
  const key = attempt ? `payout-${dealId}-r${attempt}` : `payout-${dealId}`;
  return call<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: { sender_batch_id: key, email_subject: "You've been paid through Handshake", email_message: note },
      items: [{ recipient_type: payee.type === "PAYER_ID" ? "PAYPAL_ID" : "EMAIL", receiver: payee.type === "PAYER_ID" ? payee.payerId : payee.email, amount: { currency: "USD", value: (cents / 100).toFixed(2) }, note, sender_item_id: dealId }],
    },
    key,
    "payouts",
  );
}

export type PayoutBatch = {
  batch_header: { payout_batch_id: string; batch_status: string };
  items?: { payout_item_id: string; transaction_status: string; errors?: { name?: string; message?: string } }[];
};
export const getPayoutBatch = (batchId: string) => call<PayoutBatch>("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`, undefined, undefined, "payouts");

// What a payout item's status means for the seller. UNCLAIMED: the money left us and waits for the
// recipient to claim it, so it counts as paid. A denied, failed or returned item moved no money.
export function payoutOutcome(batch: PayoutBatch): "paid" | "failed" | "pending" {
  const s = (batch.items?.[0]?.transaction_status ?? batch.batch_header.batch_status).toUpperCase();
  if (s === "SUCCESS" || s === "UNCLAIMED") return "paid";
  if (["DENIED", "FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "CANCELED"].includes(s)) return "failed";
  return "pending";
}

// Invoicing v2: the buyer's receipt. The same invoice actions PayPal's Agent Toolkit gives AI agents
// (create_invoice, send_invoice, record_payment_for_invoice), called directly like every other PayPal
// call here. A receipt records money PayPal already captured; it never moves any.
export type Invoice = {
  id: string;
  status: string;
  detail?: { invoice_number?: string; metadata?: { recipient_view_url?: string; invoicer_view_url?: string } };
};
export const createInvoice = (body: unknown, key: string) => call<Invoice>("POST", "/v2/invoicing/invoices", body, key);
export const getInvoice = (id: string) => call<Invoice>("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
// Recorded without PayPal emailing anyone: the receipt is shown on the deal page. Sandbox addresses
// can't receive mail anyway, and a buyer who paid by card may have left no email.
export const sendInvoice = (id: string) =>
  call("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, { send_to_invoicer: false, send_to_recipient: false }, `receipt-send-${id}`);
export const recordInvoicePayment = (id: string, cents: number, date: string, note: string) =>
  call<{ payment_id?: string }>(
    "POST",
    `/v2/invoicing/invoices/${encodeURIComponent(id)}/payments`,
    { method: "PAYPAL", payment_date: date, amount: money(cents), note: note.slice(0, 2000) },
    `receipt-paid-${id}`,
  );
// Finds an invoice by its number: recovers a receipt PayPal created but whose answer never arrived.
export const findInvoice = (number: string) =>
  call<{ items?: Invoice[] }>("POST", "/v2/invoicing/search-invoices?page=1&page_size=1&total_required=false", { invoice_number: number });

export function holdFrom(order: Order) {
  const unit = order.purchase_units[0];
  const auth = unit?.payments?.authorizations?.[0];
  return {
    authorizationId: auth?.id,
    authorizationStatus: auth?.status,
    buyerEmail: order.payer?.email_address,
    buyer: order.payer?.payer_id
      ? { payerId: order.payer.payer_id, name: [order.payer.name?.given_name, order.payer.name?.surname].filter(Boolean).join(" "), email: order.payer.email_address }
      : undefined,
    shipTo: unit?.shipping ? { name: unit.shipping.name?.full_name, address: unit.shipping.address } : undefined,
  };
}
