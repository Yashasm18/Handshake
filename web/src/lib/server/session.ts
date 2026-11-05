import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Who someone is, as PayPal told us when they signed in. The payer id is what payouts are sent to.
export type Account = {
  payerId: string;
  name: string;
  firstName: string;
  email?: string;
  // PayPal says the account is verified (a confirmed bank account or card).
  verified: boolean;
};

export const SESSION_COOKIE = "hs_session";
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// SESSION_SECRET when set; otherwise a key derived from the PayPal client secret, so sign-in works
// without extra setup and no one without the server's secrets can forge a session.
export function sessionSecret(): string | null {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const base = process.env.PAYPAL_CLIENT_SECRET;
  return base ? createHmac("sha256", base).update("handshake-session-v1").digest("base64url") : null;
}

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// A signed value: base64url(JSON) + "." + HMAC. Readable by us, unforgeable without the secret.
export function seal(data: object, secret: string, ttlMs: number, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: now + ttlMs })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function unseal<T>(value: string | undefined, secret: string | null, now = Date.now()): T | null {
  if (!value || !secret) return null;
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra !== undefined || !safeEqual(mac, sign(body, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof data.exp !== "number" || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

export const sealSession = (account: Account, secret: string, now = Date.now()) => seal({ a: account }, secret, SESSION_MS, now);

export function openSession(value: string | undefined, secret: string | null, now = Date.now()): Account | null {
  const a = unseal<{ a?: Account }>(value, secret, now)?.a;
  return a && typeof a.payerId === "string" && a.payerId ? a : null;
}

const cookieOptions = (maxAgeSec: number) => ({
  httpOnly: true,
  // Lax: sent when PayPal redirects back to us (a top-level GET), never on a cross-site POST.
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSec,
});

export async function currentAccount(): Promise<Account | null> {
  return openSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
}

export async function startSession(account: Account) {
  const secret = sessionSecret();
  if (!secret) throw new Error("Sign-in isn't configured.");
  (await cookies()).set(SESSION_COOKIE, sealSession(account, secret), cookieOptions(SESSION_MS / 1000));
}

export async function endSession() {
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(0));
}

// Short-lived state for one sign-in attempt: the CSRF state and where to go afterwards.
export const OAUTH_COOKIE = "hs_oauth";
export const OAUTH_MS = 10 * 60_000;
export { cookieOptions };
