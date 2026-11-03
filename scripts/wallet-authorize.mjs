// After Maya approves the wallet order in the browser, place the hold and release it.
// Run: node scripts/wallet-authorize.mjs <ORDER_ID>
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = env.PAYPAL_API_BASE;
const orderId = process.argv[2];

const tok = await (await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
})).json();

const call = async (method, path) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": randomUUID() },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const order = await call("GET", `/v2/checkout/orders/${orderId}`);
console.log(`order status: ${order.json.status}, payer: ${order.json.payer?.email_address ?? "-"}`);

const auth = await call("POST", `/v2/checkout/orders/${orderId}/authorize`);
const a = auth.json.purchase_units?.[0]?.payments?.authorizations?.[0];
if (!a) {
  console.log(`FAIL authorize: HTTP ${auth.status} ${auth.json.details?.[0]?.issue || auth.json.name}`);
  process.exit(1);
}
console.log(`PASS wallet hold placed: auth ${a.id} ${a.status} $${a.amount.value}, buyer ${auth.json.payer?.email_address}`);

const v = await call("POST", `/v2/payments/authorizations/${a.id}/void`);
console.log(`${v.status < 300 ? "PASS" : "FAIL"} released Maya's hold: ${v.json.status ?? v.status}`);
