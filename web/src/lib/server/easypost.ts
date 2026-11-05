import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// EasyPost reads tracking from 100+ carriers, so Handshake doesn't integrate UPS, FedEx and USPS one by one.
// Plain HTTPS, no SDK. Test keys (EZTK…) use EasyPost's simulated parcels.
const API = "https://api.easypost.com/v2";

export const trackingEnabled = () => Boolean(process.env.EASYPOST_API_KEY);
export const testMode = () => (process.env.EASYPOST_API_KEY ?? "").startsWith("EZTK");

export type EasyPostTracker = {
  id: string;
  mode?: "test" | "production";
  tracking_code: string;
  status: string;
  status_detail?: string;
  est_delivery_date?: string | null;
  updated_at?: string;
  tracking_details?: {
    message?: string;
    status?: string;
    status_detail?: string;
    datetime?: string;
    tracking_location?: { city?: string | null; state?: string | null; country?: string | null; zip?: string | null };
  }[];
};

const auth = () => "Basic " + Buffer.from(`${process.env.EASYPOST_API_KEY}:`).toString("base64");

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`EasyPost ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

// Creating the same number twice returns the existing tracker, so this is safe to retry.
export const createTracker = (trackingCode: string, carrier?: string) =>
  call<EasyPostTracker>("POST", "/trackers", { tracker: { tracking_code: trackingCode, ...(carrier && carrier !== "OTHER" ? { carrier } : {}) } });

export const getTracker = (id: string) => call<EasyPostTracker>("GET", `/trackers/${encodeURIComponent(id)}`);

// Webhooks are signed: "hmac-sha256-hex=" + HMAC-SHA256 of the raw body, keyed with the NFKD-normalized
// secret. This mirrors EasyPost's own client library (including its whole-number weight quirk).
export function verifyWebhook(rawBody: string, signature: string | null, secret: string | undefined) {
  if (!signature || !secret) return false;
  const body = rawBody.replace(/("weight":\s*)(\d+)(\s*)(?=,|\})/g, "$1$2.0");
  const expected = `hmac-sha256-hex=${createHmac("sha256", Buffer.from(secret.normalize("NFKD"), "utf8")).update(body, "utf8").digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
