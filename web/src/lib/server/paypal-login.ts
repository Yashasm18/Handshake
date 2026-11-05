import "server-only";
import type { Account } from "./session";

// Log in with PayPal (OAuth 2.0 authorization code flow). The seller proves who they are on PayPal's
// own page; Handshake never sees their password and gets back their payer id, which is where payouts go.
const API = () => process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const WEB = () => (API().includes("sandbox") ? "https://www.sandbox.paypal.com" : "https://www.paypal.com");

// paypalattributes adds the payer id and the account's verification status.
export const SCOPES = "openid profile email https://uri.paypal.com/services/paypalattributes";

export const loginEnabled = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

export function authorizeUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    flowEntry: "static",
    client_id: process.env.PAYPAL_CLIENT_ID ?? "",
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${WEB()}/connect?${q}`;
}

export class LoginError extends Error {}

const basic = () => "Basic " + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${API()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new LoginError(json.error_description ?? `PayPal sign-in failed (${res.status}).`);
  return json.access_token;
}

// PayPal's user info, in either of the shapes it returns (paypalv1.1 or OpenID).
export type PayPalProfile = {
  payer_id?: string;
  user_id?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  emails?: { value: string; primary?: boolean; confirmed?: boolean }[];
  verified_account?: boolean | string;
  verified?: boolean | string;
};

export function accountFrom(p: PayPalProfile): Account {
  if (!p.payer_id) throw new LoginError("PayPal didn't share your account id, so we couldn't set up payouts. Try signing in again.");
  const email = p.emails?.find((e) => e.primary)?.value ?? p.emails?.[0]?.value ?? p.email;
  const name = (p.name || [p.given_name, p.family_name].filter(Boolean).join(" ")).trim().slice(0, 80);
  const firstName = (p.given_name || name.split(/\s+/)[0] || "PayPal user").slice(0, 40);
  const flag = p.verified_account ?? p.verified;
  return { payerId: p.payer_id, name: name || firstName, firstName, email, verified: flag === true || flag === "true" };
}

export async function fetchAccount(accessToken: string): Promise<Account> {
  const res = await fetch(`${API()}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new LoginError(`PayPal didn't return your profile (${res.status}).`);
  return accountFrom((await res.json()) as PayPalProfile);
}

// Only same-site paths: a sign-in link can never bounce someone to another website.
// Control characters and backslashes are refused outright (URL parsers drop tabs and newlines, so
// "/\t/evil.com" would become "//evil.com"), and the result must still resolve to this site.
export function safeNext(next: string | null | undefined) {
  const fallback = "/deals";
  if (!next || next.length > 300 || !next.startsWith("/") || next.startsWith("//") || /[\x00-\x1f\x7f\\]/.test(next)) return fallback;
  const url = new URL(next, "http://handshake.invalid");
  if (url.origin !== "http://handshake.invalid") return fallback;
  return url.pathname + url.search;
}

// The URL PayPal sends people back to. It has to match the Return URL set in the PayPal app exactly.
export function callbackUrl(req: Request) {
  if (process.env.APP_URL) return `${process.env.APP_URL.replace(/\/$/, "")}/api/auth/paypal/callback`;
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/api/auth/paypal/callback`;
}
