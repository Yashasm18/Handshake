import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { authorizeUrl, callbackUrl, loginEnabled, safeNext } from "@/lib/server/paypal-login";
import { OAUTH_COOKIE, OAUTH_MS, cookieOptions, seal, sessionSecret } from "@/lib/server/session";

// Starts "Sign in with PayPal": remembers a one-time state in a signed cookie and hands back PayPal's
// sign-in URL. The browser then goes to PayPal itself, like any "Log in with PayPal" button.
// There is deliberately no server redirect to PayPal: a free-hosting address that bounces straight to a
// PayPal login is what phishing kits do, and Chrome blocks it.
export async function POST(req: Request) {
  // Only this site's own pages may start a sign-in.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(callbackUrl(req)).origin) return Response.json({ error: "Not allowed." }, { status: 403 });
  const { next: raw } = z.object({ next: z.string().max(300).optional() }).catch({ next: undefined }).parse(await req.json().catch(() => ({})));
  const next = safeNext(raw);
  const secret = sessionSecret();
  if (!loginEnabled() || !secret) return Response.json({ unavailable: true, next }, { headers: { "Cache-Control": "no-store" } });
  const state = randomBytes(24).toString("base64url");
  const redirectUri = callbackUrl(req);
  (await cookies()).set(OAUTH_COOKIE, seal({ state, next, redirectUri }, secret, OAUTH_MS), cookieOptions(OAUTH_MS / 1000));
  return Response.json({ url: authorizeUrl(redirectUri, state) }, { headers: { "Cache-Control": "no-store" } });
}

// Old links land back on the page they came from; signing in always starts from a button.
export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  return new Response(null, { status: 303, headers: { Location: next, "Cache-Control": "no-store" } });
}
