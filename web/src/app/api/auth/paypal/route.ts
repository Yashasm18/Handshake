import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authorizeUrl, callbackUrl, loginEnabled, safeNext } from "@/lib/server/paypal-login";
import { OAUTH_COOKIE, OAUTH_MS, cookieOptions, seal, sessionSecret } from "@/lib/server/session";

// Starts "Sign in with PayPal": remembers a one-time state in a signed cookie, then sends the browser to PayPal.
export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const secret = sessionSecret();
  if (!loginEnabled() || !secret) return Response.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}signin=unavailable`, req.url), 303);
  const state = randomBytes(24).toString("base64url");
  const redirectUri = callbackUrl(req);
  (await cookies()).set(OAUTH_COOKIE, seal({ state, next, redirectUri }, secret, OAUTH_MS), cookieOptions(OAUTH_MS / 1000));
  return new Response(null, { status: 303, headers: { Location: authorizeUrl(redirectUri, state), "Cache-Control": "no-store" } });
}
