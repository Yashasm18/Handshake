// Day-1 sandbox check for Handshake's money flow.
// Run: node scripts/sandbox-test.mjs
// Uses PayPal's published sandbox test card so no buyer login is needed.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = env.PAYPAL_API_BASE;

async function token() {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  return (await res.json()).access_token;
}
const TOKEN = await token();

// Every mutating call gets its own idempotency key (the bug in agent-toolkit #98).
async function pp(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json, debugId: res.headers.get("paypal-debug-id") };
}

const card = {
  card: {
    number: "4111111111111111",
    expiry: "2030-12",
    security_code: "123",
    name: "Maya Buyer",
    billing_address: { address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" },
  },
};
const shipping = {
  name: { full_name: "Maya Buyer" },
  address: { address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" },
};

function authorizeOrder(value, extra = {}) {
  return pp("POST", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [{ reference_id: "deal", description: "iPhone 13 128GB (Handshake demo)", amount: { currency_code: "USD", value }, shipping, ...extra }],
    payment_source: card,
  });
}

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
}
const err = (r) => `HTTP ${r.status} ${r.json.name || ""} ${r.json.details?.[0]?.issue || r.json.message || ""} (debug ${r.debugId})`;

// A. Hold $200 -> partial capture $160 (final) -> tracking -> payout to seller
const a = await authorizeOrder("200.00");
const authA = a.json.purchase_units?.[0]?.payments?.authorizations?.[0];
report("A1 card-funded AUTHORIZE hold $200", !!authA, authA ? `order ${a.json.id}, auth ${authA.id} ${authA.status}` : err(a));

if (authA) {
  const cap = await pp("POST", `/v2/payments/authorizations/${authA.id}/capture`, {
    amount: { currency_code: "USD", value: "160.00" },
    final_capture: true,
    invoice_id: `HS-${Date.now()}`,
    note_to_payer: "Handshake settlement: $40 released for screen crack",
  });
  const b = cap.json.seller_receivable_breakdown;
  report("A2 partial capture $160 with final_capture", cap.status < 300, cap.status < 300
    ? `capture ${cap.json.id} ${cap.json.status}; gross ${b?.gross_amount?.value} fee ${b?.paypal_fee?.value} net ${b?.net_amount?.value}`
    : err(cap));

  const after = await pp("GET", `/v2/payments/authorizations/${authA.id}`);
  report("A3 authorization state after final partial capture", after.status < 300, `status ${after.json.status}`);

  if (cap.status < 300) {
    const track = await pp("POST", `/v2/checkout/orders/${a.json.id}/track`, {
      capture_id: cap.json.id,
      tracking_number: `1Z999AA1${Date.now().toString().slice(-8)}`,
      carrier: "UPS",
      notify_payer: false,
    });
    report("A4 attach tracking after capture", track.status < 300, track.status < 300 ? "tracking attached" : err(track));

    const payout = await pp("POST", "/v1/payments/payouts", {
      sender_batch_header: { sender_batch_id: `HS-${Date.now()}`, email_subject: "Your Handshake payout", email_message: "Payment for your iPhone 13 sale" },
      items: [{ recipient_type: "EMAIL", receiver: env.SELLER_EMAIL, amount: { currency: "USD", value: "150.00" }, note: "Handshake deal payout", sender_item_id: "deal-1" }],
    });
    const batch = payout.json.batch_header;
    report("A5 Payouts v1 to seller $150", payout.status < 300, batch ? `batch ${batch.payout_batch_id} ${batch.batch_status}` : err(payout));
  }
}

// B. Hold $50 -> void (free full release)
const bOrder = await authorizeOrder("50.00");
const authB = bOrder.json.purchase_units?.[0]?.payments?.authorizations?.[0];
if (authB) {
  const v = await pp("POST", `/v2/payments/authorizations/${authB.id}/void`);
  report("B  void a hold (free full refund)", v.status < 300, `HTTP ${v.status} ${v.json.status || ""}`);
} else report("B  void a hold", false, err(bOrder));

// C. Can we hold with the money going straight to the seller, then capture it ourselves?
const cOrder = await authorizeOrder("25.00", { payee: { email_address: env.SELLER_EMAIL } });
const authC = cOrder.json.purchase_units?.[0]?.payments?.authorizations?.[0];
if (authC) {
  const c = await pp("POST", `/v2/payments/authorizations/${authC.id}/capture`, { final_capture: true });
  report("C  payee=seller hold, captured by Handshake", c.status < 300, c.status < 300 ? `capture ${c.json.id} ${c.json.status}` : err(c));
} else report("C  payee=seller hold", false, err(cOrder));

// D. PayPal-wallet order for Maya to approve by hand (the real buyer UX)
const dOrder = await pp("POST", "/v2/checkout/orders", {
  intent: "AUTHORIZE",
  purchase_units: [{ amount: { currency_code: "USD", value: "200.00" }, description: "iPhone 13 (wallet approval test)" }],
  payment_source: { paypal: { experience_context: { return_url: "https://example.com/return", cancel_url: "https://example.com/cancel", user_action: "CONTINUE" } } },
});
const approve = dOrder.json.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
report("D  wallet AUTHORIZE order created", !!approve, approve ? `order ${dOrder.json.id}` : err(dOrder));
if (approve) console.log(`\nAPPROVE_URL ${approve.href}\nWALLET_ORDER_ID ${dOrder.json.id}`);

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
