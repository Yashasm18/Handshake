import "server-only";
import { randomUUID } from "node:crypto";

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
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
async function call<T>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
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
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
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

export async function payoutSeller(dealId: string, sellerEmail: string, cents: number, note: string) {
  return call<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: { sender_batch_id: `${dealId}-${Date.now()}`, email_subject: "You've been paid through Handshake", email_message: note },
      items: [{ recipient_type: "EMAIL", receiver: sellerEmail, amount: { currency: "USD", value: (cents / 100).toFixed(2) }, note, sender_item_id: dealId }],
    },
    `payout-${dealId}`,
  );
}

export function holdFrom(order: Order) {
  const unit = order.purchase_units[0];
  const auth = unit?.payments?.authorizations?.[0];
  return {
    authorizationId: auth?.id,
    authorizationStatus: auth?.status,
    buyerEmail: order.payer?.email_address,
    shipTo: unit?.shipping ? { name: unit.shipping.name?.full_name, address: unit.shipping.address } : undefined,
  };
}
